// ==UserScript==
// @name            WME HN NavPoints (beta)
// @namespace       https://greasyfork.org/users/166843
// @description     Shows navigation points of all house numbers in WME
// @version         2023.04.19.01
// @author          dBsooner
// @grant           GM_xmlhttpRequest
// @connect         greasyfork.org
// @require         https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// @license         GPLv3
// @match           http*://*.waze.com/*editor*
// @exclude         http*://*.waze.com/user/editor*
// @contributionURL https://github.com/WazeDev/Thank-The-Authors
// ==/UserScript==

/* global _, $, GM_info, GM_xmlhttpRequest, OpenLayers, W, WazeWrap */

/*
 * Original concept and code for WME HN NavPoints was written by MajkiiTelini. After version 0.6.6, this
 * script is maintained by the WazeDev team. Special thanks is definitely given to MajkiiTelini for his
 * hard work and dedication to the original script.
 *
 */

(function () {
    'use strict';

    // eslint-disable-next-line no-nested-ternary
    const _SCRIPT_SHORT_NAME = `HN NavPoints${(/beta/.test(GM_info.script.name) ? ' β' : /\(DEV\)/i.test(GM_info.script.name) ? ' Ω' : '')}`,
        _SCRIPT_LONG_NAME = GM_info.script.name,
        _IS_ALPHA_VERSION = /[Ω]/.test(_SCRIPT_SHORT_NAME),
        _IS_BETA_VERSION = /[β]/.test(_SCRIPT_SHORT_NAME),
        _PROD_URL = 'https://greasyfork.org/scripts/390565-wme-hn-navpoints/code/WME%20HN%20NavPoints.user.js',
        _PROD_META_URL = 'https://greasyfork.org/scripts/390565-wme-hn-navpoints/code/WME%20HN%20NavPoints.meta.js',
        _FORUM_URL = 'https://www.waze.com/forum/viewtopic.php?f=819&t=269397',
        _SETTINGS_STORE_NAME = 'WMEHNNavPoints',
        _BETA_URL = 'YUhSMGNITTZMeTluY21WaGMzbG1iM0pyTG05eVp5OXpZM0pwY0hSekx6TTVNRFUzTXkxM2JXVXRhRzR0Ym1GMmNHOXBiblJ6TFdKbGRHRXZZMjlrWlM5WFRVVWxNakJJVGlVeU1FNWhkbEJ2YVc1MGN5VXlNQ2hpWlhSaEtTNTFjMlZ5TG1weg==',
        _BETA_META_URL = 'YUhSMGNITTZMeTluY21WaGMzbG1iM0pyTG05eVp5OXpZM0pwY0hSekx6TTVNRFUzTXkxM2JXVXRhRzR0Ym1GMmNHOXBiblJ6TFdKbGRHRXZZMjlrWlM5WFRVVWxNakJJVGlVeU1FNWhkbEJ2YVc1MGN5VXlNQ2hpWlhSaEtTNXRaWFJoTG1weg==',
        _ALERT_UPDATE = true,
        _SCRIPT_VERSION = GM_info.script.version.toString(),
        _SCRIPT_VERSION_CHANGES = ['<b>NEW:</b> Check for updated version on load.',
            '<b>NEW:</b> Moved settings to new HN NavPoints tab.',
            '<b>CHANGE:</b> WME production now includes function from WME beta.'
        ],
        _DEBUG = /[βΩ]/.test(_SCRIPT_SHORT_NAME),
        _LOAD_BEGIN_TIME = performance.now(),
        _spinners = {
            destroyAllHNs: false,
            drawHNs: false,
            processSegs: false
        },
        _timeouts = {
            checkMarkersEvents: undefined,
            hideTooltip: undefined,
            onWmeReady: undefined,
            saveSettingsToStorage: undefined,
            setMarkersEvents: undefined,
            stripTooltipHTML: undefined
        },
        _holdFeatures = {
            hn: [],
            lines: []
        },
        dec = (s = '') => atob(atob(s));

    let _settings = {},
        _scriptActive = false,
        _HNLayerObserver,
        _saveButtonObserver,
        _HNNavPointsLayer,
        _HNNavPointsNumbersLayer,
        _wmeHnLayer,
        _processedSegments = [],
        _segmentsToProcess = [],
        _segmentsToRemove = [],
        _$hnNavPointsTooltipDiv,
        _popup = {
            inUse: false,
            hnNumber: -1,
            segmentId: -1
        },
        _lastVersionChecked = '0';

    function log(message, data = '') { console.log(`${_SCRIPT_SHORT_NAME}:`, message, data); }
    function logError(message, data = '') { console.error(`${_SCRIPT_SHORT_NAME}:`, new Error(message), data); }
    // function logWarning(message, data = '') { console.warn(`${_SCRIPT_SHORT_NAME}:`, message, data); }
    function logDebug(message, data = '') {
        if (_DEBUG)
            log(message, data);
    }

    async function loadSettingsFromStorage() {
        const defaultSettings = {
                disableBelowZoom: 17,
                enableTooltip: true,
                hnLines: true,
                hnNumbers: true,
                keepHNLayerOnTop: true,
                toggleHNNavPointsShortcut: '',
                toggleHNNavPointsNumbersShortcut: '',
                lastSaved: 0,
                lastVersion: undefined
            },
            loadedSettings = $.parseJSON(localStorage.getItem(_SETTINGS_STORE_NAME));
        _settings = $.extend({}, defaultSettings, loadedSettings);
        const serverSettings = await WazeWrap.Remote.RetrieveSettings(_SETTINGS_STORE_NAME);
        if (serverSettings?.lastSaved > _settings.lastSaved)
            $.extend(_settings, serverSettings);
        if (_settings.disableBelowZoom < 11)
            _settings.disableBelowZoom += 12;
        _timeouts.saveSettingsToStorage = window.setTimeout(saveSettingsToStorage, 5000);

        return Promise.resolve();
    }

    function saveSettingsToStorage() {
        checkTimeout({ timeout: 'saveSettingsToStorage' });
        if (localStorage) {
            _settings.lastVersion = _SCRIPT_VERSION;
            _settings.lastSaved = Date.now();
            localStorage.setItem(_SETTINGS_STORE_NAME, JSON.stringify(_settings));
            WazeWrap.Remote.SaveSettings(_SETTINGS_STORE_NAME, _settings);
            logDebug('Settings saved.');
        }
    }

    function showScriptInfoAlert() {
        if (_ALERT_UPDATE && (_SCRIPT_VERSION !== _settings.lastVersion)) {
            let releaseNotes = '';
            releaseNotes += '<p>What\'s New:</p>';
            if (_SCRIPT_VERSION_CHANGES.length > 0) {
                releaseNotes += '<ul>';
                for (let idx = 0; idx < _SCRIPT_VERSION_CHANGES.length; idx++)
                    releaseNotes += `<li>${_SCRIPT_VERSION_CHANGES[idx]}`;
                releaseNotes += '</ul>';
            }
            else {
                releaseNotes += '<ul><li>Nothing major.</ul>';
            }
            WazeWrap.Interface.ShowScriptUpdate(_SCRIPT_SHORT_NAME, _SCRIPT_VERSION, releaseNotes, (_IS_BETA_VERSION ? dec(_BETA_URL) : _PROD_URL).replace(/code\/.*\.js/, ''), _FORUM_URL);
        }
    }

    function checkShortcutsChanged() {
        let triggerSave = false;
        ['toggleHNNavPointsShortcut', 'toggleHNNavPointsNumbersShortcut'].forEach((k) => {
            let keys = '';
            const { shortcut } = W.accelerators.Actions[k];
            if (shortcut) {
                if (shortcut.altKey)
                    keys += 'A';
                if (shortcut.shiftKey)
                    keys += 'S';
                if (shortcut.ctrlKey)
                    keys += 'C';
                if (keys !== '')
                    keys += '+';
                if (shortcut.keyCode)
                    keys += shortcut.keyCode;
            }
            else {
                keys = '';
            }
            if (_settings[k] !== keys) {
                _settings[k] = keys;
                triggerSave = true;
            }
        });
        if (triggerSave)
            saveSettingsToStorage();
    }

    function checkTimeout(obj) {
        if (obj.toIndex) {
            if (_timeouts[obj.timeout]?.[obj.toIndex]) {
                window.clearTimeout(_timeouts[obj.timeout][obj.toIndex]);
                delete (_timeouts[obj.timeout][obj.toIndex]);
            }
        }
        else {
            if (_timeouts[obj.timeout])
                window.clearTimeout(_timeouts[obj.timeout]);
            _timeouts[obj.timeout] = undefined;
        }
    }

    function doSpinner(spinnerName = '', spin = true) {
        const $btn = $('#hnNPSpinner');
        if (!spin) {
            _spinners[spinnerName] = false;
            if (!Object.values(_spinners).some((a) => a === true)) {
                if ($btn.length > 0) {
                    $btn.removeClass('fa-spin');
                    $('#divHnNPSpinner').hide();
                }
                else {
                    $('#topbar-container .topbar').prepend(
                        '<div id="divHnNPSpinner" title="WME HN NavPoints is currently processing house numbers." style="font-size:20px;background:white;float:left;margin-left:-20px;display:none;">'
                    + '<i id="hnNPSpinner" class="fa fa-spinner"></i></div>'
                    );
                }
            }
        }
        else {
            _spinners[spinnerName] = true;
            if ($btn.length === 0) {
                _spinners[spinnerName] = true;
                $('#topbar-container .topbar').prepend(
                    '<div id="divHnNPSpinner" title="WME HN NavPoints is currently processing house numbers." style="font-size:20px;background:white;float:left;margin-left:-20px;">'
                + '<i id="hnNPSpinner" class="fa fa-spinner fa-spin"></i></div>'
                );
            }
            else if (!$btn.hasClass('fa-spin')) {
                $btn.addClass('fa-spin');
                $('#divHnNPSpinner').show();
            }
        }
    }

    function processSegmentsToRemove(force = false) {
        if (_segmentsToRemove.length > 0) {
            const removeMarker = (marker) => { _HNNavPointsNumbersLayer.removeMarker(marker); };
            let linesToRemove = [],
                hnsToRemove = [];
            for (let i = _segmentsToRemove.length - 1; i > -1; i--) {
                const segId = _segmentsToRemove[i];
                if (!W.model.segments.objects[segId] || force) {
                    _segmentsToRemove.splice(i, 1);
                    linesToRemove = linesToRemove.concat(_HNNavPointsLayer.getFeaturesByAttribute('segmentId', segId));
                    if (!_settings.enableTooltip)
                        hnsToRemove = hnsToRemove.concat(_HNNavPointsNumbersLayer.getFeaturesByAttribute('segmentId', segId));
                    else
                        _HNNavPointsNumbersLayer.markers.filter((marker) => marker.segmentId === segId).forEach((marker) => removeMarker(marker));
                }
            }
            if (linesToRemove.length > 0)
                _HNNavPointsLayer.removeFeatures(linesToRemove);
            if (hnsToRemove.length > 0)
                _HNNavPointsNumbersLayer.removeFeatures(hnsToRemove);
        }
    }

    async function hnLayerToggled(checked) {
        _HNNavPointsLayer.setVisibility(checked);
        _settings.hnLines = checked;
        saveSettingsToStorage();
        if (checked) {
            if (!_scriptActive)
                await initBackgroundTasks('enable');
            processSegs('hnLayerToggled', W.model.segments.getByAttributes({ hasHNs: true }));
        }
        else if (!_settings.hnNumbers && _scriptActive) {
            initBackgroundTasks('disable');
        }
    }

    async function hnNumbersLayerToggled(checked) {
        _HNNavPointsNumbersLayer.setVisibility(checked);
        _settings.hnNumbers = checked;
        saveSettingsToStorage();
        if (checked) {
            if (!_scriptActive)
                await initBackgroundTasks('enable');
            processSegs('hnNumbersLayerToggled', W.model.segments.getByAttributes({ hasHNs: true }));
        }
        else if (!_settings.hnLines && _scriptActive) {
            initBackgroundTasks('disable');
        }
    }

    function observeHNLayer() {
        if (W.editingMediator.attributes.editingHouseNumbers && !_HNLayerObserver.observing) {
            [_wmeHnLayer] = W.map.getLayersByName('houseNumberMarkers');
            _HNLayerObserver.observe(_wmeHnLayer.div, {
                childList: false, subtree: true, attributes: true, attributeOldValue: true
            });
            _HNLayerObserver.observing = true;
        }
        else if (_HNLayerObserver.observing) {
            _HNLayerObserver.disconnect();
            _HNLayerObserver.observing = false;
        }
        if (!_HNLayerObserver.observing) {
            W.model.segmentHouseNumbers.clear();
            const holdSegmentsToRemove = [..._segmentsToRemove];
            _segmentsToRemove = _segmentsToRemove.concat([..._segmentsToProcess]);
            processSegmentsToRemove(true);
            _segmentsToRemove = [...holdSegmentsToRemove];
            processSegs('exithousenumbers', W.model.segments.getByIds(_segmentsToProcess), true);
            _wmeHnLayer = undefined;
        }
        else {
            _segmentsToProcess = W.selectionManager.getSegmentSelection().segments.map((segment) => segment.attributes.id);
            _segmentsToRemove = [];
        }
        _saveButtonObserver.disconnect();
        _saveButtonObserver.observe(document.querySelector('#toolbar .js-save-popover-target'), {
            childList: false, attributes: true, attributeOldValue: true, characterData: false, characterDataOldValue: false, subtree: false
        });
    }

    function flushHeldFeatures() {
        if (_holdFeatures.hn.length === 0)
            return;
        if (_HNNavPointsLayer.getFeaturesByAttribute('featureId', _holdFeatures.hn[0].attributes.featureId).length === 0) {
            if (_settings.enableTooltip)
                _HNNavPointsNumbersLayer.addMarker(_holdFeatures.hn);
            else
                _HNNavPointsNumbersLayer.addFeatures(_holdFeatures.hn);
            _HNNavPointsLayer.addFeatures(_holdFeatures.lines);
        }
        _holdFeatures.hn = [];
        _holdFeatures.lines = [];
    }

    function removeHNs(objArr, holdFeatures = false) {
        let linesToRemove = [],
            hnsToRemove = [];
        if (_holdFeatures.hn.length > 0)
            flushHeldFeatures();
        objArr.forEach((hnObj) => {
            linesToRemove = linesToRemove.concat(_HNNavPointsLayer.getFeaturesByAttribute('featureId', hnObj.attributes.id));
            if (holdFeatures)
                _holdFeatures.lines = _HNNavPointsLayer.getFeaturesByAttribute('featureId', hnObj.attributes.id);
            if (!_settings.enableTooltip) {
                hnsToRemove = hnsToRemove.concat(_HNNavPointsNumbersLayer.getFeaturesByAttribute('featureId', hnObj.attributes.id));
                if (holdFeatures)
                    _holdFeatures.hn = _HNNavPointsNumbersLayer.getFeaturesByAttribute('featureId', hnObj.attributes.id);
            }
            else {
                _HNNavPointsNumbersLayer.markers.filter((a) => a.featureId === hnObj.attributes.id).forEach((marker) => {
                    if (holdFeatures)
                        _holdFeatures.hn = marker;
                    _HNNavPointsNumbersLayer.removeMarker(marker);
                });
            }
        });
        if (linesToRemove.length > 0)
            _HNNavPointsLayer.removeFeatures(linesToRemove);
        if (hnsToRemove.length > 0)
            _HNNavPointsNumbersLayer.removeFeatures(hnsToRemove);
    }

    function drawHNs(houseNumberArr) {
        if (houseNumberArr.length === 0)
            return;
        doSpinner('drawHNs', true);
        const lineFeatures = [],
            numberFeatures = !_settings.enableTooltip ? [] : undefined,
            svg = _settings.enableTooltip ? document.createElementNS('http://www.w3.org/2000/svg', 'svg') : undefined,
            svgText = _settings.enableTooltip ? document.createElementNS('http://www.w3.org/2000/svg', 'text') : undefined,
            invokeTooltip = _settings.enableTooltip ? (evt) => { showTooltip(evt); } : undefined;
        if (_settings.enableTooltip) {
            svg.setAttribute('xlink', 'http://www.w3.org/1999/xlink');
            svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            svg.setAttribute('viewBox', '0 0 40 14');
            svgText.setAttribute('text-anchor', 'middle');
            svgText.setAttribute('x', '20');
            svgText.setAttribute('y', '10');
        }
        for (let i = 0; i < houseNumberArr.length; i++) {
            const hnObj = houseNumberArr[i],
                segmentId = hnObj.getSegmentId(),
                seg = W.model.segments.objects[segmentId];
            if (seg) {
                const featureId = hnObj.getID(),
                    markerIdx = _settings.enableTooltip ? _HNNavPointsNumbersLayer.markers.map((marker) => marker.featureId).indexOf(featureId) : undefined,
                    // eslint-disable-next-line no-nested-ternary
                    hnToRemove = _settings.enableTooltip ? (markerIdx > -1) ? _HNNavPointsNumbersLayer.markers[markerIdx] : [] : _HNNavPointsNumbersLayer.getFeaturesByAttribute('featureId', featureId),
                    rtlChar = /[\u0590-\u083F]|[\u08A0-\u08FF]|[\uFB1D-\uFDFF]|[\uFE70-\uFEFF]/mg,
                    textDir = (hnObj.getNumber().match(rtlChar) !== null) ? 'rtl' : 'ltr';
                _HNNavPointsLayer.removeFeatures(_HNNavPointsLayer.getFeaturesByAttribute('featureId', featureId));
                if (hnToRemove.length > 0) {
                    if (_settings.enableTooltip)
                        _HNNavPointsNumbersLayer.removeMarker(hnToRemove);
                    else
                        _HNNavPointsNumbersLayer.removeFeatures(_HNNavPointsNumbersLayer.getFeaturesByAttribute('featureId', featureId));
                }
                const p1 = new OpenLayers.Geometry.Point(hnObj.getFractionPoint().x, hnObj.getFractionPoint().y),
                    p2 = new OpenLayers.Geometry.Point(hnObj.getGeometry().x, hnObj.getGeometry().y),
                    // eslint-disable-next-line no-nested-ternary
                    strokeColor = (hnObj.isForced()
                        ? (!hnObj.getUpdatedBy()) ? 'red' : 'orange'
                        : (!hnObj.getUpdatedBy()) ? 'yellow' : 'white'
                    );
                let lineString = new OpenLayers.Geometry.LineString([p1, p2]),
                    lineFeature = new OpenLayers.Feature.Vector(
                        lineString,
                        { segmentId, featureId },
                        {
                            strokeWidth: 4, strokeColor: 'black', strokeOpacity: 0.5, strokeDashstyle: 'dash', strokeDashArray: '8, 8'
                        }
                    );
                lineFeatures.push(lineFeature);
                lineString = new OpenLayers.Geometry.LineString([p1, p2]);
                lineFeature = new OpenLayers.Feature.Vector(
                    lineString,
                    { segmentId, featureId },
                    {
                        strokeWidth: 2, strokeColor, strokeOpacity: 1, strokeDashstyle: 'dash', strokeDashArray: '8, 8'
                    }
                );
                lineFeatures.push(lineFeature);
                if (_settings.enableTooltip) {
                    svg.setAttribute('style', `text-shadow:0 0 3px ${strokeColor},0 0 3px ${strokeColor},0 0 3px ${strokeColor},0 0 3px ${strokeColor},0 0 3px ${strokeColor},0 0 3px ${strokeColor};font-size:14px;font-weight:bold;font-family:"Open Sans", "Arial Unicode MS", "sans-serif";direction:${textDir}`);
                    svgText.textContent = hnObj.getNumber();
                    svg.innerHTML = svgText.outerHTML;
                    const svgIcon = new WazeWrap.Require.Icon(`data:image/svg+xml,${svg.outerHTML}`, { w: 40, h: 18 }),
                        markerFeature = new OpenLayers.Marker(new OpenLayers.LonLat(p2.x, p2.y), svgIcon);
                    markerFeature.events.register('mouseover', null, invokeTooltip);
                    markerFeature.events.register('mouseout', null, hideTooltipDelay);
                    markerFeature.featureId = featureId;
                    markerFeature.segmentId = segmentId;
                    markerFeature.hnNumber = hnObj.getNumber() || '';
                    _HNNavPointsNumbersLayer.addMarker(markerFeature);
                }
                else {
                // eslint-disable-next-line new-cap
                    numberFeatures.push(new OpenLayers.Feature.Vector(new OpenLayers.Geometry.Polygon.createRegularPolygon(p2, 1, 20), {
                        segmentId, featureId, hNumber: hnObj.getNumber(), strokeWidth: 3, Color: strokeColor, textDir
                    }));
                }
                if ((_holdFeatures.hn.length > 0) && (_holdFeatures.hn.map((a) => a.attributes.featureId).indexOf(featureId) > -1)) {
                    _holdFeatures.hn = [];
                    _holdFeatures.lines = [];
                }
            }
        }
        if (lineFeatures.length > 0)
            _HNNavPointsLayer.addFeatures(lineFeatures);
        if (!_settings.enableTooltip && (numberFeatures.length > 0))
            _HNNavPointsNumbersLayer.addFeatures(numberFeatures);
        doSpinner('drawHNs', false);
    }

    function destroyAllHNs() {
        doSpinner('destroyAllHNs', true);
        _HNNavPointsLayer.destroyFeatures();
        if (_settings.enableTooltip)
            _HNNavPointsNumbersLayer.clearMarkers();
        else
            _HNNavPointsNumbersLayer.destroyFeatures();
        _processedSegments = [];
        doSpinner('destroyAllHNs', false);
        Promise.resolve();
    }

    function processSegs(action, arrSegObjs, processAll = false, retry = 0) {
    /* As of 2020.06.08 (sometime before this date) updatedOn does not get updated when updating house numbers. Looking for a new
     * way to track which segments have been updated most recently to prevent a total refresh of HNs after an event.
     * Changed to using a global to keep track of segmentIds touched during HN edit mode.
     */
        if ((action === 'settingChanged') && (W.map.getZoom() < _settings.disableBelowZoom)) {
            destroyAllHNs();
            return;
        }
        if (!arrSegObjs || (arrSegObjs.length === 0) || (W.map.getZoom() < _settings.disableBelowZoom) || preventProcess())
            return;
        doSpinner('processSegs', true);
        const eg = W.map.getExtent().toGeometry(),
            findObjIndex = (array, fldName, value) => array.map((a) => a[fldName]).indexOf(value),
            processError = (err, chunk) => {
                logDebug(`Retry: ${retry}`);
                if (retry < 5)
                    processSegs(action, chunk, true, ++retry);
                else
                    logError(`Get HNs for ${chunk.length} segments failed. Code: ${err.status} - Text: ${err.responseText}`);
            },
            processJSON = (jsonData) => {
                if ((jsonData?.error === undefined) && (typeof jsonData?.segmentHouseNumbers?.objects !== 'undefined'))
                    drawHNs(jsonData.segmentHouseNumbers.objects);
            };
        if ((action === 'objectsremoved')) {
            if (arrSegObjs?.length > 0) {
                const removedSegIds = [];
                let hnNavPointsToRemove = [],
                    hnNavPointsNumbersToRemove = [];
                arrSegObjs.forEach((segObj) => {
                    const segmentId = segObj.getID();
                    if (!eg.intersects(segObj.geometry) && (segmentId > 0)) {
                        hnNavPointsToRemove = hnNavPointsToRemove.concat(_HNNavPointsLayer.getFeaturesByAttribute('segmentId', segmentId));
                        if (!_settings.enableTooltip)
                            hnNavPointsNumbersToRemove = hnNavPointsNumbersToRemove.concat(_HNNavPointsNumbersLayer.getFeaturesByAttribute('segmentId', segmentId));
                        else
                            removedSegIds.push(segmentId);
                        const segIdx = findObjIndex(_processedSegments, 'segId', segmentId);
                        if (segIdx > -1)
                            _processedSegments.splice(segIdx, 1);
                    }
                });
                if (hnNavPointsToRemove.length > 0)
                    _HNNavPointsLayer.removeFeatures(hnNavPointsToRemove);
                if (hnNavPointsNumbersToRemove.length > 0)
                    _HNNavPointsNumbersLayer.removeFeatures(hnNavPointsNumbersToRemove);
                if (removedSegIds.length > 0) {
                    _HNNavPointsNumbersLayer.markers.filter((marker) => removedSegIds.includes(marker.segmentId)).forEach((marker) => {
                        _HNNavPointsNumbersLayer.removeMarker(marker);
                    });
                }
            }
        }
        else { // action = 'objectsadded', 'zoomend', 'init', 'exithousenumbers', 'hnLayerToggled', 'hnNumbersLayerToggled', 'settingChanged', 'afterSave'
            let i = arrSegObjs.length;
            while (i--) {
                if (arrSegObjs[i].getID() < 0) {
                    arrSegObjs.splice(i, 1);
                }
                else {
                    const segIdx = findObjIndex(_processedSegments, 'segId', arrSegObjs[i].getID());
                    if (segIdx > -1) {
                        if (arrSegObjs[i].getUpdatedOn() > _processedSegments[segIdx].updatedOn)
                            _processedSegments[segIdx].updatedOn = arrSegObjs[i].getUpdatedOn();
                        else if (!processAll)
                            arrSegObjs.splice(i, 1);
                    }
                    else {
                        _processedSegments.push({ segId: arrSegObjs[i].getID(), updatedOn: arrSegObjs[i].getUpdatedOn() });
                    }
                }
            }
            while (arrSegObjs.length > 0) {
                let chunk;
                if (retry === 1)
                    chunk = arrSegObjs.splice(0, 250);
                else if (retry === 2)
                    chunk = arrSegObjs.splice(0, 125);
                else if (retry === 3)
                    chunk = arrSegObjs.splice(0, 100);
                else if (retry === 4)
                    chunk = arrSegObjs.splice(0, 50);
                else
                    chunk = arrSegObjs.splice(0, 500);
                try {
                    W.controller.descartesClient.getHouseNumbers(chunk.map((segObj) => segObj.getID())).then(processJSON).catch((error) => processError(error, [...chunk]));
                }
                catch (error) {
                    processError(error, [...chunk]);
                }
            }
        }
        doSpinner('processSegs', false);
    }

    function preventProcess() {
        if (!_settings.hnLines && !_settings.hnNumbers) {
            if (_scriptActive)
                initBackgroundTasks('disable');
            destroyAllHNs();
            return true;
        }
        if (W.map.getZoom() < _settings.disableBelowZoom) {
            destroyAllHNs();
            return true;
        }
        return false;
    }

    function markerEvent(evt) {
        if (!evt || preventProcess())
            return;
        if (evt.type === 'click:input') {
            if (!evt?.object?.dragging?.last)
                removeHNs([evt.object.model], true);
        }
        else if (evt.type === 'delete') {
            removeHNs([evt.object.model]);
        }
        else if (evt.type === 'mousedown') {
            if (evt.target.classList.contains('drag-handle') && evt?.data?.marker?.model)
                removeHNs([evt.data.marker.model], true);
        }
        else if (evt.type === 'mouseup') {
            if (evt.target.classList.contains('drag-handle') && (_holdFeatures.hn.length > 0))
                flushHeldFeatures();
        }
    }

    function setMarkersEvents(reclick = false, targetNode = undefined) {
        if (W.editingMediator.attributes.editingHouseNumbers) {
            checkTimeout({ timeout: 'setMarkersEvents' });
            hideTooltip();
            if (!_wmeHnLayer || (_wmeHnLayer?.markers?.length === 0)) {
                _timeouts.setMarkersEvents = window.setTimeout(setMarkersEvents, 50, reclick, targetNode);
                return;
            }
            _wmeHnLayer.markers.forEach((marker) => {
                marker.events.unregister('click:input', null, markerEvent);
                marker.events.unregister('delete', null, markerEvent);
                marker.events.on({ 'click:input': markerEvent, delete: markerEvent });
                $('.drag-handle', marker.icon.div.children[0]).off('mousedown', { marker }, markerEvent).on('mousedown', { marker }, markerEvent);
                $('.drag-handle', marker.icon.div.children[0]).off('mouseup', { marker }, markerEvent).on('mouseup', { marker }, markerEvent);
            });
            if (reclick) {
                const tmpNode = $('input.number', targetNode)[0];
                $(tmpNode)[0].focus();
                $(tmpNode)[0].setSelectionRange(tmpNode.selectionStart, tmpNode.selectionStart);
            }
        }
        else if (_wmeHnLayer) {
            _wmeHnLayer.markers.forEach((marker) => {
                marker.events.unregister('click:input', null, markerEvent);
                marker.events.unregister('delete', null, markerEvent);
            });
        }
    }

    // eslint-disable-next-line default-param-last
    function checkMarkersEvents(retry = false, tries = 0, reclick, targetNode) {
        checkTimeout({ timeout: 'checkMarkersEvents' });
        if (_wmeHnLayer?.markers?.length > 0) {
            if (!_wmeHnLayer.markers[0].events.listeners['click:input'].some((callbackFn) => callbackFn.func === markerEvent))
                setMarkersEvents(reclick, targetNode);
        }
        else if (retry && (tries < 50)) {
            _timeouts.checkMarkersEvents = window.setTimeout(checkMarkersEvents, 100, true, ++tries, reclick, targetNode);
        }
        else if (retry) {
            logError('Timeout (5 sec) exceeded waiting for markers to popuplate within checkMarkersEvents');
        }
    }

    function segmentsEvent(evt) {
        if (!evt || preventProcess())
            return;
        if ((this.action === 'objectssynced') || (this.action === 'objectsremoved'))
            processSegmentsToRemove();
        if (this.action === 'objectschanged-id') {
            const oldSegmentId = evt.oldID,
                newSegmentID = evt.newID;
            _HNNavPointsLayer.getFeaturesByAttribute('segmentId', oldSegmentId).forEach((feature) => { feature.attributes.segmentId = newSegmentID; });
            if (_settings.enableTooltip)
                _HNNavPointsNumbersLayer.markers.filter((marker) => marker.segmentId === oldSegmentId).forEach((marker) => { marker.segmentId = newSegmentID; });
            else
                _HNNavPointsNumbersLayer.getFeaturesByAttribute('segmentId', oldSegmentId).forEach((feature) => { feature.attributes.segmentId = newSegmentID; });
        }
        else if (this.action === 'objects-state-deleted') {
            evt.forEach((obj) => {
                if (_segmentsToRemove.indexOf(obj.getID()) === -1)
                    _segmentsToRemove.push(obj.getID());
            });
        }
        else {
            processSegs(this.action, evt.filter((seg) => seg.attributes.hasHNs));
        }
    }

    function objectsChangedIdHNs(evt) {
        if (!evt || preventProcess())
            return;
        const oldFeatureId = evt.oldID,
            newFeatureId = evt.newID;
        _HNNavPointsLayer.getFeaturesByAttribute('featureId', oldFeatureId).forEach((feature) => { feature.attributes.featureId = newFeatureId; });
        if (_settings.enableTooltip)
            _HNNavPointsNumbersLayer.markers.filter((marker) => marker.featureId === oldFeatureId).forEach((marker) => { marker.featureId = newFeatureId; });
        else
            _HNNavPointsNumbersLayer.getFeaturesByAttribute('featureId', oldFeatureId).forEach((feature) => { feature.attributes.featureId = newFeatureId; });
    }

    function objectsChangedHNs(evt) {
        if (!evt || preventProcess())
            return;
        if ((evt.length === 1) && evt[0].getSegmentId() && (_segmentsToProcess.indexOf(evt[0].getSegmentId()) === -1))
            _segmentsToProcess.push(evt[0].getSegmentId());
        checkMarkersEvents();
    }

    function objectsStateDeletedHNs(evt) {
        if (!evt || preventProcess())
            return;
        if ((evt.length === 1) && evt[0].getSegmentId() && (_segmentsToProcess.indexOf(evt[0].getSegmentId()) === -1))
            _segmentsToProcess.push(evt[0].getSegmentId());
        removeHNs(evt);
        checkMarkersEvents();
    }

    function objectsAddedHNs(evt) {
        if (!evt || preventProcess())
            return;
        if ((evt.length === 1) && evt[0].getSegmentId() && (_segmentsToProcess.indexOf(evt[0].getSegmentId()) === -1))
            _segmentsToProcess.push(evt[0].getSegmentId());
        checkMarkersEvents(true, 0);
    }

    function zoomEndEvent() {
        if (preventProcess())
            return;
        if ((W.map.getZoom() < _settings.disableBelowZoom))
            destroyAllHNs();
        if ((W.map.getZoom() > (_settings.disableBelowZoom - 1)) && (_processedSegments.length === 0))
            processSegs('zoomend', W.model.segments.getByAttributes({ hasHNs: true }), true);
    }

    function afterActionsEvent(evt) {
        if (!evt || preventProcess())
            return;
        if ((evt.type === 'afterclearactions') || (evt.type === 'noActions')) {
            processSegmentsToRemove();
        }
        else if (evt.action?._description?.indexOf('Deleted house number') > -1) {
            if (evt.type === 'afterundoaction')
                drawHNs([evt.action.object]);
            else
                removeHNs([evt.action.object]);
            setMarkersEvents();
        }
        else if (evt.action?._description?.indexOf('Updated house number') > -1) {
            const tempEvt = _.cloneDeep(evt);
            if (evt.type === 'afterundoaction') {
                if (tempEvt.action.newAttributes?.number)
                    tempEvt.action.attributes.number = tempEvt.action.newAttributes.number;
            }
            else if (evt.type === 'afteraction') {
                if (tempEvt.action.oldAttributes?.number)
                    tempEvt.action.attributes.number = tempEvt.action.oldAttributes.number;
            }
            removeHNs([tempEvt.action.object]);
            drawHNs([evt.action.object]);
            setMarkersEvents();
        }
        else if (evt.action?._description?.indexOf('Added house number') > -1) {
            if (evt.type === 'afterundoaction')
                removeHNs([evt.action.houseNumber]);
            else
                drawHNs([evt.action.houseNumber]);
        }
        else if (evt.action?._description?.indexOf('Moved house number') > -1) {
            drawHNs([evt.action.newHouseNumber]);
        }
        else if (evt.action?.houseNumber) {
            drawHNs((evt.action.newHouseNumber ? [evt.action.newHouseNumber] : [evt.action.houseNumber]));
            setMarkersEvents();
        }
        checkMarkersEvents();
    }

    async function reloadClicked() {
        if (preventProcess() || ($('div.w-icon.w-icon-refresh').attr('class').indexOf('disabled') > 0))
            return;
        await destroyAllHNs();
        processSegs('reload', W.model.segments.getByAttributes({ hasHNs: true }));
    }

    function initBackgroundTasks(status) {
        if (status === 'enable') {
            _HNLayerObserver = new MutationObserver((mutationsList) => {
                mutationsList.forEach((mutation) => {
                    if (mutation.type === 'attributes') {
                        if ((mutation.oldValue?.indexOf('active') > -1) && (_holdFeatures.hn.length > 0) && ($('.active', _wmeHnLayer.div).length === 0))
                            flushHeldFeatures();
                        if ((mutation.oldValue?.indexOf('active') === -1) && mutation.target.classList.contains('active'))
                            checkMarkersEvents(true, 0, true, mutation.target);
                        const $input = $('div.olLayerDiv.house-numbers-layer div.house-number div.content.active:not(".new") input.number');
                        if ($input.val() === '')
                            $input.on('change', () => { setMarkersEvents(); }).select();
                    }
                });
            });
            _saveButtonObserver = new MutationObserver((mutationsList) => {
                if ((W.model.actionManager._redoStack.length === 0)
                    // 2023.04.06.01: Production save button observer mutations
                    && (mutationsList.some((mutation) => (mutation.attributeName === 'class')
                            && mutation.target.classList.contains('waze-icon-save')
                            && (mutation.oldValue.indexOf('ItemDisabled') === -1)
                            && mutation.target.classList.contains('ItemDisabled'))
                    // 2023.04.06.01: Beta save button observer mutations
                        || mutationsList.some((mutation) => ((mutation.attributeName === 'disabled')
                            && (mutation.oldValue === 'false')
                            && (mutation.target.attributes.disabled.value === 'true')))
                    )
                ) {
                    if (W.editingMediator.attributes.editingHouseNumbers)
                        processSegs('afterSave', W.model.segments.getByIds(_segmentsToProcess), true);
                    else
                        processSegmentsToRemove();
                }
            });
            _saveButtonObserver.observe(document.querySelector('#toolbar .js-save-popover-target'), {
                childList: false, attributes: true, attributeOldValue: true, characterData: false, characterDataOldValue: false, subtree: false
            });
            _saveButtonObserver.observing = true;
            W.accelerators.events.on({ reloadData: destroyAllHNs });
            $('#overlay-buttons, #edit-buttons').on('click', 'div.reload-button-region', reloadClicked);
            W.model.segments.on('objectsadded', segmentsEvent, { action: 'objectsadded' });
            W.model.segments.on('objectsremoved', segmentsEvent, { action: 'objectsremoved' });
            W.model.segments.on('objectssynced', segmentsEvent, { action: 'objectssynced' });
            W.model.segments.on('objects-state-deleted', segmentsEvent, { action: 'objects-state-deleted' });
            W.model.segments.on('objectschanged-id', segmentsEvent, { action: 'objectschanged-id' });
            W.model.segmentHouseNumbers.on({
                objectsadded: objectsAddedHNs,
                objectschanged: objectsChangedHNs,
                'objectschanged-id': objectsChangedIdHNs,
                'objects-state-deleted': objectsStateDeletedHNs
            });
            W.editingMediator.on({ 'change:editingHouseNumbers': observeHNLayer });
            W.map.events.on({
                zoomend: zoomEndEvent, addlayer: checkLayerIndex, removelayer: checkLayerIndex
            });
            WazeWrap.Events.register('afterundoaction', this, afterActionsEvent);
            WazeWrap.Events.register('afteraction', this, afterActionsEvent);
            WazeWrap.Events.register('afterclearactions', this, afterActionsEvent);
            _scriptActive = true;
        }
        else if (status === 'disable') {
            _HNLayerObserver = undefined;
            _saveButtonObserver = undefined;
            W.accelerators.events.on('reloadData', null, destroyAllHNs);
            $('#overlay-buttons, #edit-buttons').off('click', 'div.reload-button-region', reloadClicked);
            W.model.segments.off('objectsadded', segmentsEvent, { action: 'objectsadded' });
            W.model.segments.off('objectsremoved', segmentsEvent, { action: 'objectsremoved' });
            W.model.segments.off('objectschanged', segmentsEvent, { action: 'objectschanged' });
            W.model.segments.off('objects-state-deleted', segmentsEvent, { action: 'objects-state-deleted' });
            W.model.segments.off('objectschanged-id', segmentsEvent, { action: 'objectschanged-id' });
            W.model.segmentHouseNumbers.off({
                objectsadded: objectsAddedHNs,
                objectschanged: objectsChangedHNs,
                'objectschanged-id': objectsChangedIdHNs,
                'objects-state-deleted': objectsStateDeletedHNs,
                objectsremoved: removeHNs
            });
            W.editingMediator.off({ 'change:editingHouseNumbers': observeHNLayer });
            W.map.events.unregister('zoomend', null, zoomEndEvent);
            W.map.events.unregister('addlayer', null, checkLayerIndex);
            W.map.events.unregister('removelayer', null, checkLayerIndex);
            WazeWrap.Events.unregister('afterundoaction', this, afterActionsEvent);
            WazeWrap.Events.unregister('afteraction', this, afterActionsEvent);
            _scriptActive = false;
        }
        return Promise.resolve();
    }

    function enterHNEditMode(evt) {
        if (evt?.data?.segment) {
            if (evt.data.moveMap)
                W.map.setCenter(new OpenLayers.LonLat(evt.data.segment.getCenter().x, evt.data.segment.getCenter().y), W.map.getZoom());
            W.selectionManager.setSelectedModels(evt.data.segment);
            $('#segment-edit-general .edit-house-numbers').click();
        }
    }

    function showTooltip(evt) {
        if ((W.map.getZoom() < 16) || W.editingMediator.attributes.editingHouseNumbers || !_settings.enableTooltip)
            return;
        if (evt?.object?.featureId) {
            checkTooltip();
            const { segmentId, hnNumber } = evt.object;
            if (_popup.inUse && (_popup.hnNumber === hnNumber) && (_popup.segmentId === segmentId))
                return;
            const segment = W.model.segments.getObjectById(segmentId),
                street = W.model.streets.getObjectById(segment.attributes.primaryStreetID),
                popupPixel = W.map.getPixelFromLonLat(evt.object.lonlat),
                htmlOut = ''
                + '<div id="hnNavPointsTooltipDiv-tooltip" class="tippy-box" data-state="hidden" tabindex="-1" data-theme="light-border" data-animation="fade" role="tooltip" data-placement="top" '
                + '    style="max-width: 350px; transition-duration:300ms;">'
                + ' <div id="hnNavPointsTooltipDiv-content" class="tippy-content" data-state="hidden" style="transition-duration: 300ms;">'
                + '     <div>'
                + '         <div class="house-number-marker-tooltip">'
                + `             <div class="title" dir="auto">${hnNumber} ${(street ? street.name : '')}</div>`
                + `             <div class="edit-button fa fa-pencil" id="hnNavPointsTooltipDiv-edit" ${(segment.canEditHouseNumbers() ? '' : ' style="display:none"')}></div>`
                + '         </div>'
                + '     </div>'
                + ' </div>'
                + ' <div id="hnNavPointsTooltipDiv-arrow" class="tippy-arrow" style="position: absolute; left: 0px;"></div>'
                + '</div>';
            _$hnNavPointsTooltipDiv.html(htmlOut);
            popupPixel.origX = popupPixel.x;
            const popupWidthHalf = (_$hnNavPointsTooltipDiv.width() / 2);
            let arrowOffset = (popupWidthHalf - 15),
                dataPlacement = 'top',
                moveMap = false;
            popupPixel.x = ((popupPixel.x - popupWidthHalf + 5) > 0) ? (popupPixel.x - popupWidthHalf + 5) : 10;
            if (popupPixel.x === 10)
                arrowOffset = popupPixel.origX - 22;
            if ((popupPixel.x + (popupWidthHalf * 2)) > $('#map')[0].clientWidth) {
                popupPixel.x = (popupPixel.origX - _$hnNavPointsTooltipDiv.width() + 8);
                arrowOffset = (_$hnNavPointsTooltipDiv.width() - 30);
                moveMap = true;
            }
            if (popupPixel.y - _$hnNavPointsTooltipDiv.children().toArray().reduce((height, elem) => height + $(elem).outerHeight(true), 0) < 0) {
                popupPixel.y += 14;
                dataPlacement = 'bottom';
            }
            else {
                popupPixel.y -= (_$hnNavPointsTooltipDiv.children().toArray().reduce((height, elem) => height + $(elem).outerHeight(true), 0) + 14);
            }
            $('#hnNavPointsTooltipDiv-edit').on('click', { segment, moveMap }, enterHNEditMode);
            _$hnNavPointsTooltipDiv.css({ transform: `translate(${Math.round(popupPixel.x)}px, ${Math.round(popupPixel.y)}px)` });
            $('#hnNavPointsTooltipDiv-arrow').css({ transform: `translate(${Math.max(0, Math.round(arrowOffset))}px, 0px)` });
            $('#hnNavPointsTooltipDiv-tooltip').attr('data-placement', dataPlacement).attr('data-state', 'visible');
            $('#hnNavPointsTooltipDiv-content').attr('data-state', 'visible');
            _popup = { segmentId, hNumber: hnNumber, inUse: true };
        }
    }

    function stripTooltipHTML() {
        checkTimeout({ timeout: 'stripTooltipHTML' });
        _$hnNavPointsTooltipDiv.html('');
        _popup = { segmentId: -1, hnNumber: -1, inUse: false };
    }

    function hideTooltip() {
        checkTimeout({ timeout: 'hideTooltip' });
        $('#hnNavPointsTooltipDiv-content').attr('data-state', 'hidden');
        $('#hnNavPointsTooltipDiv-tooltip').attr('data-state', 'hidden');
        _timeouts.stripTooltipHTML = window.setTimeout(stripTooltipHTML, 400);
    }

    function hideTooltipDelay(evt) {
        if (!evt)
            return;
        checkTimeout({ timeout: 'hideTooltip' });
        const parentsArr = evt.toElement?.offsetParent ? [evt.toElement.offsetParent, evt.toElement.offsetParent.offSetParent] : [];
        if (evt.toElement && ((parentsArr.indexOf(_HNNavPointsNumbersLayer.div) > -1) || (parentsArr.indexOf(_$hnNavPointsTooltipDiv[0]) > -1)))
            return;
        _timeouts.hideTooltip = window.setTimeout(hideTooltip, 100, evt);
    }

    function checkTooltip() {
        checkTimeout({ timeout: 'hideTooltip' });
    }

    function checkLayerIndex() {
        const layerIdx = W.map.layers.map((a) => a.uniqueName).indexOf('__HNNavPointsNumbersLayer');
        let properIdx;
        if (_settings.keepHNLayerOnTop) {
            const layersIndexes = [],
                layersLoaded = W.map.layers.map((a) => a.uniqueName);
            ['wmeGISLayersDefault', '__HNNavPointsLayer'].forEach((layerUniqueName) => {
                if (layersLoaded.indexOf(layerUniqueName) > 0)
                    layersIndexes.push(layersLoaded.indexOf(layerUniqueName));
            });
            properIdx = (Math.max(...layersIndexes) + 1);
        }
        else {
            properIdx = (W.map.layers.map((a) => a.uniqueName).indexOf('__HNNavPointsLayer') + 1);
        }
        if (layerIdx !== properIdx) {
            W.map.layers.splice(properIdx, 0, W.map.layers.splice(layerIdx, 1)[0]);
            W.map.getOLMap().resetLayersZIndex();
        }
    }

    function checkHnNavpointsVersion() {
        if (_IS_ALPHA_VERSION)
            return;
        try {
            const metaUrl = _IS_BETA_VERSION ? dec(_BETA_META_URL) : _PROD_META_URL;
            GM_xmlhttpRequest({
                url: metaUrl,
                onload(res) {
                    const latestVersion = res.responseText.match(/@version\s+(.*)/)[1];
                    if ((latestVersion > _SCRIPT_VERSION) && (latestVersion > (_lastVersionChecked || '0'))) {
                        _lastVersionChecked = latestVersion;
                        WazeWrap.Alerts.info(
                            _SCRIPT_LONG_NAME,
                            `<a href="${(_IS_BETA_VERSION ? dec(_BETA_URL) : _PROD_URL)}" target = "_blank">Version ${latestVersion}</a> is available.<br>Update now to get the latest features and fixes.`,
                            true,
                            false
                        );
                    }
                },
                onerror(res) {
                    // Silently fail with an error message in the console.
                    logError('Upgrade version check:', res);
                }
            });
        }
        catch (err) {
            // Silently fail with an error message in the console.
            logError('Upgrade version check:', err);
        }
    }

    async function onWazeWrapReady() {
        log('Initializing.');
        checkHnNavpointsVersion();
        const navPointsNumbersLayersOptions = {
                displayInLayerSwitcher: true,
                uniqueName: '__HNNavPointsNumbersLayer',
                selectable: true,
                labelSelect: true,
                rendererOptions: { zIndexing: true },
                styleMap: new OpenLayers.StyleMap({
                    default: new OpenLayers.Style({
                        strokeColor: '${Color}',
                        strokeOpacity: 1,
                        strokeWidth: 3,
                        fillColor: '${Color}',
                        fillOpacity: 0.5,
                        pointerEvents: 'visiblePainted',
                        label: '${hNumber}',
                        fontSize: '12px',
                        fontFamily: 'Rubik, Boing-light, sans-serif;',
                        fontWeight: 'bold',
                        direction: '${textDir}',
                        labelOutlineColor: '${Color}',
                        labelOutlineWidth: 3,
                        labelSelect: true
                    })
                })
            },
            buildCheckBox = (id = '', label = '', checked = true, title = '', disabled = false) => `<wz-checkbox id="${id}" title="${title}"`
                + `${(disabled ? ' disabled' : '')}${(checked ? ' checked' : '')}`
                + `>${label}</wz-checkbox>`,
            buildTextBox = (id = '', label = '', value = '', placeHolder = '', maxlength = 0, autoComplete = 'off', title = '', disabled = false) => `<wz-text-input id="${id}" label="${label}"`
                + ` value=${value} placeholder="${placeHolder}" maxlength="${maxlength}" autocomplete="${autoComplete}" title="${title}"`
                + `${(disabled ? ' disabled' : '')}`
                + '></wz-text-input>',
            handleCheckboxToggle = function () {
                const settingName = $(this)[0].id.substr(14);
                if (settingName === 'enableTooltip') {
                    if (!this.checked)
                        _HNNavPointsNumbersLayer.clearMarkers();
                    else
                        _HNNavPointsNumbersLayer.destroyFeatures();
                    W.map.removeLayer(_HNNavPointsNumbersLayer);
                    if (this.checked)
                        _HNNavPointsNumbersLayer = new OpenLayers.Layer.Markers('HN NavPoints Numbers Layer', navPointsNumbersLayersOptions);
                    else
                        _HNNavPointsNumbersLayer = new OpenLayers.Layer.Vector('HN NavPoints Numbers Layer', navPointsNumbersLayersOptions);
                    W.map.addLayer(_HNNavPointsNumbersLayer);
                    _HNNavPointsNumbersLayer.setVisibility(_settings.hnNumbers);
                }
                _settings[settingName] = this.checked;
                if (settingName === 'keepHNLayerOnTop')
                    checkLayerIndex();
                saveSettingsToStorage();
                if ((settingName === 'enableTooltip') && (W.map.getZoom() > (_settings.disableBelowZoom - 1)) && (_settings.hnLines || _settings.hnNumbers))
                    processSegs('settingChanged', W.model.segments.getByAttributes({ hasHNs: true }), true, 0);
            },
            handleTextboxChange = function () {
                const newVal = Math.min(22, Math.max(16, parseInt(this.value)));
                if ((newVal !== _settings.disableBelowZoom) || (parseInt(this.value) !== newVal)) {
                    if (newVal !== parseInt(this.value))
                        this.value = newVal;
                    _settings.disableBelowZoom = newVal;
                    saveSettingsToStorage();
                    if ((W.map.getZoom() < newVal) && (_settings.hnLines || _settings.hnNumbers))
                        processSegs('settingChanged', null, true, 0);
                    else if (_settings.hnLines || _settings.hnNumbers)
                        processSegs('settingChanged', W.model.segments.getByAttributes({ hasHNs: true }), true, 0);
                }
            };
        await loadSettingsFromStorage();
        WazeWrap.Interface.AddLayerCheckbox('display', 'HN NavPoints', _settings.hnLines, hnLayerToggled);
        WazeWrap.Interface.AddLayerCheckbox('display', 'HN NavPoints Numbers', _settings.hnNumbers, hnNumbersLayerToggled);

        _HNNavPointsLayer = new OpenLayers.Layer.Vector('HN NavPoints Layer', {
            displayInLayerSwitcher: true,
            uniqueName: '__HNNavPointsLayer'
        });
        _HNNavPointsNumbersLayer = _settings.enableTooltip
            ? new OpenLayers.Layer.Markers('HN NavPoints Numbers Layer', navPointsNumbersLayersOptions)
            : new OpenLayers.Layer.Vector('HN NavPoints Numbers Layer', navPointsNumbersLayersOptions);
        W.map.addLayers([_HNNavPointsLayer, _HNNavPointsNumbersLayer]);
        _HNNavPointsLayer.setVisibility(_settings.hnLines);
        _HNNavPointsNumbersLayer.setVisibility(_settings.hnNumbers);
        window.addEventListener('beforeunload', () => { checkShortcutsChanged(); }, false);
        new WazeWrap.Interface.Shortcut(
            'toggleHNNavPointsShortcut',
            'Toggle HN NavPoints layer',
            'layers',
            'layersToggleHNNavPoints',
            _settings.toggleHNNavPointsShortcut,
            () => { $('#layer-switcher-item_hn_navpoints').click(); },
            null
        ).add();
        new WazeWrap.Interface.Shortcut(
            'toggleHNNavPointsNumbersShortcut',
            'Toggle HN NavPoints Numbers layer',
            'layers',
            'layersToggleHNNavPointsNumbers',
            _settings.toggleHNNavPointsNumbersShortcut,
            () => { $('#layer-switcher-item_hn_navpoints_numbers').click(); },
            null
        ).add();
        const { tabLabel, tabPane } = W.userscripts.registerSidebarTab('HN-NavPoints');
        tabLabel.innerHTML = '<i class="w-icon w-icon-location"></i>';
        tabLabel.title = _SCRIPT_SHORT_NAME;
        tabPane.innerHTML = `<h4><b>${_SCRIPT_LONG_NAME}</b></h4>`
            + `<h6 style="margin-top:0px">${_SCRIPT_VERSION}</h6>`
            + '<form class="attributes-form side-panel-section">'
            + '<div class="form-group">'
            + `${buildTextBox('HNNavPoints_disableBelowZoom', 'Disable when zoom level is (<) less than:', _settings.disableBelowZoom, '', 2, 'off', 'Disable NavPoints and house numbers when zoom level is less than specified number.\r\nMinimum: 16\r\nDefault: 17', false)}`
            + `${buildCheckBox('HNNavPoints_cbenableTooltip', 'Enable tooltip', _settings.enableTooltip, 'Enable tooltip when mousing over house numbers.\r\nWarning: This may cause performance issues.', false)}`
            + `${buildCheckBox('HNNavPoints_cbkeepHNLayerOnTop', 'Keep HN layer on top', _settings.keepHNLayerOnTop, 'Keep house numbers layer on top of all other layers.', false)}`
            + '</div>'
            + '</form>'
            + '<label class="control-label">Color Legend</label>'
            + '<div style="margin:0 10px 0 10px; width:130px; text-align:center; font-size:12px; background:black; font-weight:600;">'
            + ' <div style="text-shadow:0 0 3px white,0 0 3px white,0 0 3px white,0 0 3px white,0 0 3px white,0 0 3px white,0 0 3px white,0 0 3px white,0 0 3px white,0 0 3px white;">Touched</div>'
            + ' <div style="text-shadow:0 0 3px orange,0 0 3px orange,0 0 3px orange,0 0 3px orange,0 0 3px orange,0 0 3px orange,0 0 3px orange,0 0 3px orange,0 0 3px orange,0 0 3px orange;'
            + '     ">Touched forced</div>'
            + ' <div style="text-shadow:0 0 3px yellow,0 0 3px yellow,0 0 3px yellow, 0 0 3px yellow,0 0 3px yellow,0 0 3px yellow,0 0 3px yellow,0 0 3px yellow,0 0 3px yellow,0 0 3px yellow;'
            + '     ">Untouched</div>'
            + ' <div style="text-shadow:0 0 3px red,0 0 3px red,0 0 3px red,0 0 3px red,0 0 3px red,0 0 3px red,0 0 3px red,0 0 3px red,0 0 3px red,0 0 3px red;">Untouched forced</div>'
            + '</div></div>';
        tabPane.id = 'sidepanel-hn-navpoints';
        await W.userscripts.waitForElementConnected(tabPane);
        $('#HNNavPoints_disableBelowZoom').off().on('focusout', handleTextboxChange);
        $('wz-checkbox[id^="HNNavPoints_cb"]').off().on('click', handleCheckboxToggle);
        if (!_$hnNavPointsTooltipDiv) {
            $('#map').append(
                '<div data-tippy-root id="hnNavPointsTooltipDiv" style="z-index:9999; visibility:visible; position:absolute; inset: auto auto 0px 0px; '
            + 'margin: 0px; top: 0px; left: 0px;"></div>'
            );
            _$hnNavPointsTooltipDiv = $('#hnNavPointsTooltipDiv');
            _$hnNavPointsTooltipDiv.on('mouseleave', null, hideTooltipDelay);
            _$hnNavPointsTooltipDiv.on('mouseenter', null, checkTooltip);
        }
        await initBackgroundTasks('enable');
        checkLayerIndex();
        log(`Fully initialized in ${Math.round(performance.now() - _LOAD_BEGIN_TIME)} ms.`);
        showScriptInfoAlert();
        if (_scriptActive)
            processSegs('init', W.model.segments.getByAttributes({ hasHNs: true }));
        setTimeout(checkShortcutsChanged, 10000);
    }

    function onWmeReady(tries = 1) {
        if (typeof tries === 'object')
            tries = 1;
        checkTimeout({ timeout: 'onWmeReady' });
        if (WazeWrap?.Ready) {
            logDebug('WazeWrap is ready. Proceeding with initialization.');
            onWazeWrapReady();
        }
        else if (tries < 1000) {
            logDebug(`WazeWrap is not in Ready state. Retrying ${tries} of 1000.`);
            _timeouts.onWmeReady = window.setTimeout(onWmeReady, 200, ++tries);
        }
        else {
            logError(new Error('onWmeReady timed out waiting for WazeWrap Ready state.'));
        }
    }

    function onWmeInitialized() {
        if (W.userscripts?.state?.isReady) {
            logDebug('W is ready and already in "wme-ready" state. Proceeding with initialization.');
            onWmeReady(1);
        }
        else {
            logDebug('W is ready, but state is not "wme-ready". Adding event listener.');
            document.addEventListener('wme-ready', onWmeReady, { once: true });
        }
    }

    function bootstrap() {
        if (!W) {
            logDebug('W is not available. Adding event listener.');
            document.addEventListener('wme-initialized', onWmeInitialized, { once: true });
        }
        else {
            onWmeInitialized();
        }
    }

    bootstrap();
}
)();
