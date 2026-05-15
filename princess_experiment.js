// ===== プリンセス認知マップ 実験スクリプト =====

// === 定数 ===
const RING_PADDING = 30;
const MIN_GAP = 12;

// === DOM キャッシュ ===
let appContainer, screen1, screen2, screen3, screen4, screen5,
    subjectNameInput, subjectAgeInput, subjectEmailInput,
    goToScreen2Btn, startExperimentBtn,
    canvasContainer, clusterCanvas, ctx,
    finishPlacementBtn, goToFeedbackBtn, saveFeedbackAndDataBtn,
    loadingSpinner, statusMessage, detailsPanel,
    backToScreen1Btn, backToScreen2Btn, backToStartBtn2;

// === グローバル変数 ===
let experimentData = {
    subjectInfo: {}, positions: [], clusters: [],
    placementTime: null, moveHistory: [], relations: []
};
let isSubmitting = false;
let currentMode = 'intro';
let princessContainers = {};
let isDrawingCluster = false;
let currentDrawingCluster = null;
let activeDeleteButton = null;
let selectedClusterIndexForDeletion = -1;

// === プリンセス一覧 ===
let princessList = [
    { name: "aurora",      label: "オーロラ姫",   imgSrc: "aurora_738f085c.jpeg",                        info: "" },
    { name: "annaandelsa", label: "アナとエルサ", imgSrc: "IMG_9781.JPG",                                info: "" },
    { name: "rapunzel",    label: "ラプンツェル", imgSrc: "rapunzel_8f01586c.jpeg",                      info: "" },
    { name: "snow_white",  label: "白雪姫",       imgSrc: "snow_white_37217e1f.jpeg",                    info: "" },
    { name: "jasmine",     label: "ジャスミン",   imgSrc: "1280x1280.webp",                              info: "" },
    { name: "belle",       label: "ベル",         imgSrc: "belle_a0c06a3b.jpeg",                         info: "" },
    { name: "cinderella",  label: "シンデレラ",   imgSrc: "cinderella_fc_cinderella_t_2e79b61f.jpeg",                             info: "" },
    { name: "moana",       label: "モアナ",       imgSrc: "モアナ画像_from disneu.co.jp:fc:moana.jpeg", info: "" },
    { name: "ariel",       label: "アリエル",     imgSrc: "ariel_fc_little-mermaid_t_c2b937fa.jpeg",    info: "" },
];

// ===================================================
// ユーティリティ
// ===================================================

function getCurrentTimestamp() {
    if (!experimentData.startTime) return 0;
    return Math.floor((Date.now() - experimentData.startTime) / 1000);
}

function getFoodRectAndCenter(el, container) {
    const cRect = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const left = r.left - cRect.left;
    const top  = r.top  - cRect.top;
    const width = r.width;
    const height = r.height;
    return { left, top, width, height, centerX: left + width / 2, centerY: top + height / 2 };
}

function circleRectOverlapRatio(cx, cy, radius, rect, samplesPerSide) {
    samplesPerSide = samplesPerSide || 20;
    let inside = 0;
    const total = samplesPerSide * samplesPerSide;
    for (let i = 0; i < samplesPerSide; i++) {
        for (let j = 0; j < samplesPerSide; j++) {
            const x = rect.left + (i + 0.5) * (rect.width  / samplesPerSide);
            const y = rect.top  + (j + 0.5) * (rect.height / samplesPerSide);
            const dx = x - cx, dy = y - cy;
            if (dx * dx + dy * dy <= radius * radius) inside++;
        }
    }
    return inside / total;
}

function waitImagesLoaded(rootEl) {
    const imgs = Array.from(rootEl.querySelectorAll('img'));
    if (imgs.length === 0) return Promise.resolve();
    let done = 0;
    return new Promise(function(res) {
        const check = function() { if (++done >= imgs.length) res(); };
        imgs.forEach(function(img) {
            if (img.complete) check();
            else {
                img.addEventListener('load',  check, { once: true });
                img.addEventListener('error', check, { once: true });
            }
        });
    });
}

function setCenterPos(el, cx, cy) {
    const w = el.offsetWidth  || 96;
    const h = el.offsetHeight || 96;
    el.style.position = 'absolute';
    el.style.left = Math.round(cx - w / 2) + 'px';
    el.style.top  = Math.round(cy - h / 2) + 'px';
}

function arrangeInitialLayout(canvas, containersMap) {
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const cx = W / 2, cy = H / 2;
    const any = Object.values(containersMap)[0];
    const itemW = any ? (any.offsetWidth  || 96) : 96;
    const itemH = any ? (any.offsetHeight || 96) : 96;
    const itemR = Math.max(itemW, itemH) / 2;
    const ringRadius = Math.max(120, Math.min(W, H) * 0.40 - itemR - RING_PADDING);
    const names = Object.keys(containersMap);
    const n = names.length;
    if (n === 0) return;
    const neededArc = (Math.max(itemW, itemH) + MIN_GAP) / ringRadius;
    const baseStep  = Math.max((2 * Math.PI) / n, neededArc);
    let angle = -Math.PI / 2;
    names.forEach(function(name) {
        const jitter = (Math.random() - 0.5) * (baseStep * 0.25);
        const a = angle + jitter;
        setCenterPos(containersMap[name], cx + ringRadius * Math.cos(a), cy + ringRadius * Math.sin(a));
        angle += baseStep;
    });
}

function showScreen(screenToShow) {
    if (!appContainer || !screenToShow) return;
    [screen1, screen2, screen3, screen4, screen5].forEach(function(s) { if (s) s.classList.remove('active'); });
    screenToShow.classList.add('active');
    if (!appContainer.classList.contains('active')) appContainer.classList.add('active');
}

function updateStatusMessage(message) {
    if (statusMessage) statusMessage.textContent = message;
}

function showLoading(show, message) {
    if (!loadingSpinner || !statusMessage) return;
    if (show) { loadingSpinner.classList.add('active'); statusMessage.textContent = message || '読み込み中...'; }
    else       { loadingSpinner.classList.remove('active'); }
}

function removeActiveDeleteButton() {
    if (activeDeleteButton) { activeDeleteButton.remove(); activeDeleteButton = null; }
}

function getRandomClusterColor() {
    const r = Math.floor(Math.random() * 180) + 50;
    const g = Math.floor(Math.random() * 180) + 50;
    const b = Math.floor(Math.random() * 180) + 50;
    return 'rgb(' + r + ',' + g + ',' + b + ')';
}

// ===================================================
// 描画
// ===================================================

function drawCircle(centerX, centerY, radius, strokeStyle, fillStyle, lineWidth, isFilled) {
    if (!ctx || radius <= 0) return;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
    if (strokeStyle) ctx.strokeStyle = strokeStyle;
    if (lineWidth)   ctx.lineWidth   = lineWidth;
    ctx.stroke();
    if (isFilled !== false && fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
}

function drawAllClusters() {
    if (!ctx || !clusterCanvas) return;
    ctx.clearRect(0, 0, clusterCanvas.width, clusterCanvas.height);
    experimentData.clusters.forEach(function(cluster) {
        if (cluster.type === 'circle' && cluster.radius > 0) {
            const fillColor = cluster.color.replace('rgb(', 'rgba(').replace(')', ', 0.2)');
            drawCircle(cluster.centerX, cluster.centerY, cluster.radius, cluster.color, fillColor, 2, true);
        }
    });
}

// ===================================================
// プリンセス詳細
// ===================================================

function displayPrincessDetails(princess) {
    const nameEl        = document.getElementById('details-food-name');
    const imageEl       = document.getElementById('details-food-image');
    const infoEl        = document.getElementById('details-food-info');
    const placeholderEl = document.getElementById('details-placeholder');
    if (!detailsPanel || !nameEl || !imageEl || !infoEl || !placeholderEl) return;

    if (!princess) {
        nameEl.textContent = ''; imageEl.src = ''; imageEl.style.display = 'none';
        infoEl.innerHTML = ''; placeholderEl.style.display = 'block'; detailsPanel.scrollTop = 0;
        Object.values(princessContainers).forEach(function(pc) { pc.classList.remove('selected-food-item'); });
        return;
    }
    nameEl.textContent = princess.label;
    imageEl.src = princess.imgSrc; imageEl.style.display = 'block';
    infoEl.innerHTML = princess.info ? princess.info.replace(/\n/g, '<br>') : '情報なし';
    placeholderEl.style.display = 'none'; detailsPanel.scrollTop = 0;
    Object.values(princessContainers).forEach(function(pc) { pc.classList.remove('selected-food-item'); });
    if (princessContainers[princess.name]) princessContainers[princess.name].classList.add('selected-food-item');
}

// ===================================================
// リセット
// ===================================================

function resetScreen3UI() {
    if (canvasContainer) canvasContainer.querySelectorAll('.food-container').forEach(function(fc) { fc.remove(); });
    if (ctx && clusterCanvas) ctx.clearRect(0, 0, clusterCanvas.width, clusterCanvas.height);
    princessContainers = {};
    experimentData.clusters = [];
    drawAllClusters();
    if (detailsPanel) detailsPanel.innerHTML = '<h3 id="details-food-name"></h3><img id="details-food-image" src="" alt="選択されたプリンセスの画像" style="display:none;"><div id="details-food-info"></div><p id="details-placeholder" class="info-text" style="display:block;">プリンセスの[i]ボタンをクリックすると、ここに詳細情報が表示されます。</p>';
    if (statusMessage)           updateStatusMessage('');
    if (finishPlacementBtn)      finishPlacementBtn.style.display      = 'none';
    if (goToFeedbackBtn)         goToFeedbackBtn.style.display         = 'none';
    if (saveFeedbackAndDataBtn)  saveFeedbackAndDataBtn.style.display  = 'none';
    if (clusterCanvas)           clusterCanvas.classList.remove('active-drawing');
    removeActiveDeleteButton();
    isDrawingCluster = false; currentDrawingCluster = null;
}

// ===================================================
// ドラッグ
// ===================================================

function makeDraggable(element, handle, princess) {
    var infoViewStartTime = null;
    var lastViewed = null;

    handle.querySelector('.info-button').addEventListener('click', function(e) {
        e.stopPropagation();
        if (currentMode !== 'placement' && currentMode !== 'clustering') return;
        if (infoViewStartTime && lastViewed) {
            experimentData.moveHistory.push({ timestamp: getCurrentTimestamp(), eventType: 'infoViewEnd', target: lastViewed.name, details: { duration: Math.floor((Date.now() - infoViewStartTime) / 1000) } });
        }
        displayPrincessDetails(princess);
        infoViewStartTime = Date.now(); lastViewed = princess;
        experimentData.moveHistory.push({ timestamp: getCurrentTimestamp(), eventType: 'infoViewStart', target: princess.name });
    });

    handle.onmousedown = function(e) {
        if (infoViewStartTime && lastViewed) {
            experimentData.moveHistory.push({ timestamp: getCurrentTimestamp(), eventType: 'infoViewEnd', target: lastViewed.name, details: { duration: Math.floor((Date.now() - infoViewStartTime) / 1000) } });
            infoViewStartTime = null; lastViewed = null;
        }
        if (currentMode !== 'placement' || e.button !== 0) { handle.style.cursor = 'default'; return; }

        var isDragging = true;
        element.classList.add('dragging'); handle.style.cursor = 'grabbing';
        var iMouseX = e.clientX, iMouseY = e.clientY;
        var iElemX  = element.offsetLeft, iElemY = element.offsetTop;
        experimentData.moveHistory.push({ timestamp: getCurrentTimestamp(), eventType: 'dragStart', target: element.dataset.name, position: { x: iElemX, y: iElemY } });

        function onMouseMove(me) {
            if (!isDragging) return;
            var nX = Math.max(0, Math.min(iElemX + (me.clientX - iMouseX), canvasContainer.clientWidth  - element.offsetWidth));
            var nY = Math.max(0, Math.min(iElemY + (me.clientY - iMouseY), canvasContainer.clientHeight - element.offsetHeight));
            element.style.left = nX + 'px'; element.style.top = nY + 'px';
        }
        function onMouseUp() {
            if (!isDragging) return;
            isDragging = false; element.classList.remove('dragging');
            handle.style.cursor = (currentMode === 'placement') ? 'grab' : 'default';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup',   onMouseUp);
            var fX = element.offsetLeft, fY = element.offsetTop;
            var pE = experimentData.positions.find(function(p) { return p.name === element.dataset.name; });
            if (pE) { pE.x = fX; pE.y = fY; } else { experimentData.positions.push({ name: element.dataset.name, x: fX, y: fY }); }
            experimentData.moveHistory.push({ timestamp: getCurrentTimestamp(), eventType: 'dragEnd', target: element.dataset.name, position: { x: fX, y: fY } });
        }
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup',   onMouseUp);
    };
}

// ===================================================
// クラスター
// ===================================================

function handleClusterMouseDown(e) {
    if (currentMode !== 'clustering' || isDrawingCluster || !clusterCanvas || !ctx) return;
    removeActiveDeleteButton(); isDrawingCluster = true;
    var rect = clusterCanvas.getBoundingClientRect();
    var startX = e.clientX - rect.left, startY = e.clientY - rect.top;
    currentDrawingCluster = { id: 'cluster_' + Date.now(), type: 'circle', centerX: startX, centerY: startY, radius: 0, name: '', items: [], color: getRandomClusterColor(), feedback: {} };
    clusterCanvas.addEventListener('mousemove',  handleClusterMouseMove);
    clusterCanvas.addEventListener('mouseup',    handleClusterMouseUp);
    clusterCanvas.addEventListener('mouseleave', handleClusterMouseUp);
}

function handleClusterMouseMove(e) {
    if (!isDrawingCluster || !currentDrawingCluster) return;
    var rect = clusterCanvas.getBoundingClientRect();
    var dx = (e.clientX - rect.left) - currentDrawingCluster.centerX;
    var dy = (e.clientY - rect.top)  - currentDrawingCluster.centerY;
    currentDrawingCluster.radius = Math.sqrt(dx * dx + dy * dy);
    ctx.clearRect(0, 0, clusterCanvas.width, clusterCanvas.height); drawAllClusters();
    var fillColor = currentDrawingCluster.color.replace('rgb(', 'rgba(').replace(')', ', 0.1)');
    drawCircle(currentDrawingCluster.centerX, currentDrawingCluster.centerY, currentDrawingCluster.radius, currentDrawingCluster.color, fillColor, 2, true);
}

function handleClusterMouseUp() {
    if (!isDrawingCluster || !currentDrawingCluster) return;
    isDrawingCluster = false;
    clusterCanvas.removeEventListener('mousemove',  handleClusterMouseMove);
    clusterCanvas.removeEventListener('mouseup',    handleClusterMouseUp);
    clusterCanvas.removeEventListener('mouseleave', handleClusterMouseUp);

    if (currentDrawingCluster.radius < 10) {
        updateStatusMessage('クラスターが小さすぎます。もう一度描画してください。');
        currentDrawingCluster = null; ctx.clearRect(0, 0, clusterCanvas.width, clusterCanvas.height); drawAllClusters(); return;
    }
    identifyItemsInCluster(currentDrawingCluster);
    if (currentDrawingCluster.items.length < 2) {
        updateStatusMessage('クラスター内のプリンセスが' + currentDrawingCluster.items.length + '人です。2人以上になるように作成してください。');
        currentDrawingCluster = null; ctx.clearRect(0, 0, clusterCanvas.width, clusterCanvas.height); drawAllClusters(); return;
    }
    var itemsLabel = currentDrawingCluster.items.map(function(item) {
        var p = princessList.find(function(p) { return p.name === item.name; });
        return p ? p.label : item.name;
    }).join('、 ');

    if (confirm('以下のプリンセスでクラスターを作成しますか？\n\n【内容】\n' + itemsLabel)) {
        var clusterName = prompt('このクラスターの名前を入力してください:', 'クラスター' + (experimentData.clusters.length + 1));
        if (clusterName && clusterName.trim() !== '') {
            currentDrawingCluster.name = clusterName.trim();
            var circle = currentDrawingCluster;
            circle.items = circle.items.map(function(item) {
                var el = princessContainers[item.name];
                if (!el) return item;
                var r = getFoodRectAndCenter(el, canvasContainer);
                var distPx = Math.hypot(r.centerX - circle.centerX, r.centerY - circle.centerY);
                var overlap = circleRectOverlapRatio(circle.centerX, circle.centerY, circle.radius, r, 20);
                return { name: item.name, relevance: item.relevance, center: { x: Math.round(r.centerX), y: Math.round(r.centerY) }, distToCenterPx: Math.round(distPx), overlapRatio: Number(overlap.toFixed(3)) };
            });
            circle.circleArea = Math.round(Math.PI * circle.radius * circle.radius);
            experimentData.clusters.push(circle);
            experimentData.moveHistory.push({ timestamp: getCurrentTimestamp(), eventType: 'clusterCreated', target: circle.name, details: { radius: circle.radius, itemCount: circle.items.length } });
        }
    }
    currentDrawingCluster = null; ctx.clearRect(0, 0, clusterCanvas.width, clusterCanvas.height); drawAllClusters();
}

function identifyItemsInCluster(cluster) {
    if (!cluster || cluster.radius <= 0) return;
    cluster.items = [];
    var cRect = canvasContainer.getBoundingClientRect();
    Object.values(princessContainers).forEach(function(container) {
        var rect = container.getBoundingClientRect();
        var iL = rect.left - cRect.left, iR = iL + rect.width;
        var iT = rect.top  - cRect.top,  iB = iT + rect.height;
        var clX = Math.max(iL, Math.min(cluster.centerX, iR));
        var clY = Math.max(iT, Math.min(cluster.centerY, iB));
        var dx = cluster.centerX - clX, dy = cluster.centerY - clY;
        if (Math.sqrt(dx * dx + dy * dy) <= cluster.radius) {
            var iCX = iL + rect.width / 2, iCY = iT + rect.height / 2;
            var dist = Math.hypot(iCX - cluster.centerX, iCY - cluster.centerY);
            cluster.items.push({ name: container.dataset.name, relevance: Math.round((1 - Math.min(dist, cluster.radius) / cluster.radius) * 100) });
        }
    });
}

function handleClusterClick(e) {
    if (currentMode !== 'clustering' || isDrawingCluster || !clusterCanvas || !ctx || experimentData.clusters.length === 0) return;
    removeActiveDeleteButton();
    var rect = clusterCanvas.getBoundingClientRect();
    var cX = e.clientX - rect.left, cY = e.clientY - rect.top;
    for (var i = experimentData.clusters.length - 1; i >= 0; i--) {
        var cl = experimentData.clusters[i];
        if (cl.type === 'circle' && Math.hypot(cX - cl.centerX, cY - cl.centerY) <= cl.radius) {
            selectedClusterIndexForDeletion = i;
            createAndShowDeleteButton(cl, e.clientX, e.clientY); break;
        }
    }
}

function createAndShowDeleteButton(cluster, screenX, screenY) {
    removeActiveDeleteButton();
    activeDeleteButton = document.createElement('button');
    activeDeleteButton.id = 'dynamicDeleteClusterBtn';
    activeDeleteButton.textContent = '「' + cluster.name + '」を削除';
    document.body.appendChild(activeDeleteButton);
    activeDeleteButton.style.left = (screenX + 5) + 'px';
    activeDeleteButton.style.top  = (screenY + 5) + 'px';
    activeDeleteButton.onclick = function() {
        if (selectedClusterIndexForDeletion > -1 && selectedClusterIndexForDeletion < experimentData.clusters.length) {
            var delCl = experimentData.clusters.splice(selectedClusterIndexForDeletion, 1)[0];
            experimentData.moveHistory.push({ timestamp: getCurrentTimestamp(), eventType: 'clusterDelete', target: delCl.name });
        }
        selectedClusterIndexForDeletion = -1; removeActiveDeleteButton(); drawAllClusters();
    };
}

// ===================================================
// 実験初期化
// ===================================================

function initializeExperiment() {
    currentMode = 'placement';
    if (!canvasContainer || !clusterCanvas || !ctx || !detailsPanel) { updateStatusMessage("エラー: 実験エリアの初期化に失敗しました。"); return; }
    clusterCanvas.width  = canvasContainer.clientWidth;
    clusterCanvas.height = canvasContainer.clientHeight;
    ctx.clearRect(0, 0, clusterCanvas.width, clusterCanvas.height);
    experimentData.startTime = Date.now(); experimentData.moveHistory = []; experimentData.clusters = []; experimentData.positions = [];
    experimentData.meta = { screen: { w: window.innerWidth, h: window.innerHeight }, canvas: { w: clusterCanvas.width, h: clusterCanvas.height }, userAgent: navigator.userAgent, scriptVersion: 'v12-princess' };
    detailsPanel.innerHTML = '<h3 id="details-food-name"></h3><img id="details-food-image" src="" alt="選択されたプリンセスの画像" style="display:none;"><div id="details-food-info"></div><p id="details-placeholder" class="info-text" style="display:block;">プリンセスの[i]ボタンをクリックすると、ここに詳細情報が表示されます。</p>';
    displayPrincessDetails(null);
    canvasContainer.querySelectorAll('.food-container').forEach(function(fc) { fc.remove(); });
    removeActiveDeleteButton(); princessContainers = {};

    princessList.forEach(function(princess) {
        var container = document.createElement('div'); container.className = 'food-container'; container.dataset.name = princess.name;
        var dragHandle = document.createElement('div'); dragHandle.className = 'drag-handle';
        var infoBtn = document.createElement('div'); infoBtn.className = 'info-button'; infoBtn.textContent = 'i'; infoBtn.title = princess.label + 'について';
        dragHandle.appendChild(infoBtn); container.appendChild(dragHandle);
        var img = document.createElement('img'); img.src = princess.imgSrc; img.alt = princess.label; img.className = 'food-image';
        img.onerror = function() { img.alt = princess.label + ' (画像読込失敗)'; };
        container.appendChild(img); canvasContainer.appendChild(container);
        princessContainers[princess.name] = container;
        makeDraggable(container, dragHandle, princess);
    });

    waitImagesLoaded(canvasContainer).then(function() {
        arrangeInitialLayout(canvasContainer, princessContainers);
        experimentData.positions = [];
        Object.entries(princessContainers).forEach(function(entry) {
            var name = entry[0], el = entry[1];
            experimentData.positions.push({ name: name, x: el.offsetLeft, y: el.offsetTop });
            experimentData.moveHistory.push({ timestamp: getCurrentTimestamp(), eventType: 'initialPlace', target: name, position: { x: el.offsetLeft, y: el.offsetTop } });
        });
    });

    updateStatusMessage('プリンセスの青いバーをドラッグして自由に配置してください。');
    finishPlacementBtn.style.display    = 'inline-block';
    goToFeedbackBtn.style.display       = 'none';
    saveFeedbackAndDataBtn.style.display = 'none';
    clusterCanvas.classList.remove('active-drawing');
    document.querySelectorAll('.food-container .info-button').forEach(function(btn) { btn.style.pointerEvents = 'auto'; });
    experimentData.princessesShown = princessList.map(function(p) { return p.name; });
    experimentData.moveHistory.push({ timestamp: 0, eventType: 'experimentStart', target: 'experiment' });
}

// ===================================================
// クラスターフィードバックUI
// ===================================================

function buildClusterFeedbackUI() {
    detailsPanel.innerHTML = '';
    var infoHeader = document.createElement('p'); infoHeader.className = 'info-text'; infoHeader.textContent = '作成した各クラスターについて、以下の項目を記入してください。'; detailsPanel.appendChild(infoHeader);
    if (experimentData.clusters.length === 0) { var p = document.createElement('p'); p.className = 'info-text'; p.textContent = '作成されたクラスターはありません。このまま次へ進んでください。'; detailsPanel.appendChild(p); return; }

    var clusterListContainer = document.createElement('div'); clusterListContainer.className = 'cluster-list'; detailsPanel.appendChild(clusterListContainer);
    var formContainer = document.createElement('div'); formContainer.className = 'cluster-feedback-form'; detailsPanel.appendChild(formContainer);

    function showClusterFeedback(index) {
        clusterListContainer.querySelectorAll('.cluster-list-item').forEach(function(item) { item.classList.remove('active'); });
        var btn = clusterListContainer.querySelector('[data-cluster-index="' + index + '"]');
        if (btn) btn.classList.add('active');
        var cluster = experimentData.clusters[index];
        var labels = cluster.items.map(function(item) {
            var p = princessList.find(function(p) { return p.name === item.name; });
            return p ? p.label : item.name;
        }).join('、 ');
        formContainer.innerHTML =
            '<h4>' + cluster.name + (labels ? ' (内容: ' + labels + ')' : '') + '</h4>' +
            '<label for="reasonCreated">このクラスターを作成した理由:</label>' +
            '<textarea id="reasonCreated" rows="3" placeholder="例：これらは「勇気がある」という点で似ていると感じたため。">' + (cluster.feedback && cluster.feedback.reasonCreated ? cluster.feedback.reasonCreated : '') + '</textarea>' +
            '<label for="meaning">どのような意味があると思いますか？:</label>' +
            '<textarea id="meaning" rows="3" placeholder="例：このグループは「自分の意志で行動するプリンセス」と言えるかもしれません。">' + (cluster.feedback && cluster.feedback.meaning ? cluster.feedback.meaning : '') + '</textarea>' +
            '<label for="reasonName">その名前にした理由:</label>' +
            '<textarea id="reasonName" rows="3" placeholder="例：グループの特徴をそのまま名前にしました。">' + (cluster.feedback && cluster.feedback.reasonName ? cluster.feedback.reasonName : '') + '</textarea>';
        formContainer.querySelector('#reasonCreated').addEventListener('input', function(e) { if (!cluster.feedback) cluster.feedback = {}; cluster.feedback.reasonCreated = e.target.value; });
        formContainer.querySelector('#meaning').addEventListener('input',       function(e) { if (!cluster.feedback) cluster.feedback = {}; cluster.feedback.meaning       = e.target.value; });
        formContainer.querySelector('#reasonName').addEventListener('input',    function(e) { if (!cluster.feedback) cluster.feedback = {}; cluster.feedback.reasonName    = e.target.value; });
    }

    experimentData.clusters.forEach(function(cluster, index) {
        var item = document.createElement('div'); item.className = 'cluster-list-item'; item.textContent = cluster.name; item.dataset.clusterIndex = index;
        item.addEventListener('click', function() { showClusterFeedback(index); }); clusterListContainer.appendChild(item);
    });
    showClusterFeedback(0);
}

// ===================================================
// アンケートUI
// ===================================================

function buildSurveyUI() {
    var form = document.getElementById('surveyForm');
    if (!form) return;
    var L = function(name, val, label) {
        return '<label><input type="radio" name="' + name + '" value="' + val + '"' + (val === '1' ? ' required' : '') + '><span>' + label + '</span></label>';
    };
    var likert5 = function(name) {
        return '<div class="likert-scale"><span>まったくそう思わない</span><div class="likert-options">' +
            L(name,'1','1') + L(name,'2','2') + L(name,'3','3') + L(name,'4','4') + L(name,'5','5') +
            '</div><span>非常にそう思う</span></div>';
    };
    var Q = function(num, text, inner) {
        return '<div class="survey-question"><p class="question-text">Q' + num + '. ' + text + '</p>' + inner + '</div>';
    };
    var titles = [
        '',
        '眠れる森の美女（オーロラ姫）','アナと雪の女王（アナとエルサ）','塔の上のラプンツェル（ラプンツェル）',
        '白雪姫','アラジン（ジャスミン）','美女と野獣（ベル）',
        'シンデレラ','モアナ','リトル・マーメイド（アリエル）'
    ];
    var pnames = [
        '','オーロラ姫','アナとエルサ','ラプンツェル',
        '白雪姫','ジャスミン','ベル','シンデレラ','モアナ','アリエル'
    ];
    var vals = ['aurora','annaandelsa','rapunzel','snow_white','jasmine','belle','cinderella','moana','ariel'];

    var q1html = '<div class="checkbox-options">';
    for (var i = 0; i < vals.length; i++) {
        q1html += '<label><input type="checkbox" name="q1[]" value="' + vals[i] + '">' + titles[i+1] + '</label>';
    }
    q1html += '</div>';

    var qRomance = '';
    for (var i = 0; i < 9; i++) {
        qRomance += Q(2 + i, '「' + titles[i+1] + '」の物語の中心は恋愛だと思いますか？', likert5('q' + (2 + i)));
    }
    var qFamily = '';
    for (var i = 0; i < 9; i++) {
        qFamily += Q(11 + i, '「' + titles[i+1] + '」の物語の中心は家族／友情だと思いますか？', likert5('q' + (11 + i)));
    }
    var qActive = '';
    for (var i = 0; i < 9; i++) {
        qActive += Q(20 + i, '「' + pnames[i+1] + '」の性格は、主体的に行動するタイプだと思いますか？', likert5('q' + (20 + i)));
    }
    var qPassive = '';
    for (var i = 0; i < 9; i++) {
        qPassive += Q(29 + i, '「' + pnames[i+1] + '」の性格は、受動的に行動するタイプだと思いますか？', likert5('q' + (29 + i)));
    }
    var qValues =
        Q(38, '「プリンセスらしさとは『美しさ』である。」', likert5('q38')) +
        Q(39, '「プリンセスらしさとは『勇敢』である。」', likert5('q39')) +
        Q(40, '「プリンセスらしさとは『自由』である。」', likert5('q40')) +
        Q(41, '「プリンセスらしさとは『家庭的』である。」', likert5('q41')) +
        Q(42, '「プリンセスらしさとは『恋愛』である。」', likert5('q42'));

    var q43html = '<div class="radio-options">';
    for (var i = 0; i < vals.length; i++) {
        q43html += '<label><input type="radio" name="q43" value="' + vals[i] + '"' + (i === 0 ? ' required' : '') + '>' + pnames[i+1] + '</label>';
    }
    q43html += '</div>';

    var qReason =
        Q(44, '問43の理由：そのプリンセスの「性格」に憧れるから。', likert5('q44')) +
        Q(45, '問43の理由：そのプリンセスの「ビジュアル」に憧れるから。', likert5('q45'));

    var q46html = '<div class="radio-options">' +
        '<label><input type="radio" name="q46" value="5" required>とても楽しかった</label>' +
        '<label><input type="radio" name="q46" value="4">楽しかった</label>' +
        '<label><input type="radio" name="q46" value="3">普通</label>' +
        '<label><input type="radio" name="q46" value="2">つまらなかった</label>' +
        '<label><input type="radio" name="q46" value="1">とてもつまらなかった</label>' +
        '</div>';

    var q47html = '<div class="radio-options">';
    for (var i = 0; i < vals.length; i++) {
        q47html += '<label><input type="radio" name="q47" value="' + vals[i] + '"' + (i === 0 ? ' required' : '') + '>' + titles[i+1] + '</label>';
    }
    q47html += '</div>';

    var q48html = '<div class="checkbox-options">' +
        '<label><input type="checkbox" name="q48[]" value="story">ストーリーの内容</label>' +
        '<label><input type="checkbox" name="q48[]" value="personality">プリンセスの性格</label>' +
        '<label><input type="checkbox" name="q48[]" value="era">制作年代</label>' +
        '<label><input type="checkbox" name="q48[]" value="design">見た目（デザイン）</label>' +
        '</div>';

    form.innerHTML =
        '<fieldset class="survey-section"><legend>前提知識</legend>' +
        Q(1, '実験の前にストーリーを知っていた作品を全て選んでください。（複数選択可）', q1html) +
        '</fieldset>' +
        '<fieldset class="survey-section"><legend>X軸：画一的⇔多様性 ― 物語の中心テーマ</legend>' +
        qRomance + qFamily +
        '</fieldset>' +
        '<fieldset class="survey-section"><legend>Y軸：主体的⇔受動的 ― プリンセスの行動傾向</legend>' +
        qActive + qPassive +
        '</fieldset>' +
        '<fieldset class="survey-section"><legend>価値観形成：X軸（プリンセスらしさの定義）</legend>' +
        qValues +
        '</fieldset>' +
        '<fieldset class="survey-section"><legend>価値観形成：Y軸（理想のプリンセスと理由）</legend>' +
        Q(43, 'あなたにとっての理想のプリンセスは誰ですか？（1人選択）', q43html) +
        qReason +
        '</fieldset>' +
        '<fieldset class="survey-section"><legend>遊びの質問</legend>' +
        Q(46, '実験は楽しかったですか？', q46html) +
        Q(47, '子供に特に見せたいプリンセスの物語はどれですか？（1つ選択）', q47html) +
        Q(48, 'あなたが行ったグループ分けの基準はなんでしたか？（複数選択可）', q48html) +
        '</fieldset>' +
        '<button id="submitAndFinishBtn" type="submit">アンケートを回答し、データを送信する</button>';

    document.getElementById('submitAndFinishBtn').addEventListener('click', function(e) {
        e.preventDefault();
        if (isSubmitting) return;
        var submitBtn = document.getElementById('submitAndFinishBtn');
        if (!form.checkValidity()) { alert('未回答のアンケート項目があります。全ての項目にご回答ください。'); form.reportValidity(); return; }
        isSubmitting = true; submitBtn.disabled = true; submitBtn.textContent = '送信中…（1回だけクリックしてください）';

        var surveyData = {};
        new FormData(form).forEach(function(value, key) {
            if (key.endsWith('[]')) { var k = key.slice(0, -2); if (!surveyData[k]) surveyData[k] = []; surveyData[k].push(value); }
            else { surveyData[key] = value; }
        });
        Array.from(form.elements).forEach(function(el) { if (el !== submitBtn) el.disabled = true; });

        var posMap = {};
        experimentData.positions.forEach(function(p) { posMap[p.name] = { x: p.x, y: p.y }; });
        var names2 = Object.keys(posMap);
        var distanceMatrix = {};
        names2.forEach(function(a) { distanceMatrix[a] = {}; names2.forEach(function(b) { distanceMatrix[a][b] = Math.round(Math.hypot(posMap[a].x - posMap[b].x, posMap[a].y - posMap[b].y)); }); });
        experimentData.distanceMatrix = distanceMatrix;
        experimentData.survey = surveyData;

        var finalPositions = [];
        Object.entries(princessContainers).forEach(function(entry) { finalPositions.push({ name: entry[0], x: entry[1].offsetLeft, y: entry[1].offsetTop }); });
        experimentData.finalPositions = finalPositions;

        showLoading(true, 'データを送信中...');
        var gasUrl = 'https://script.google.com/macros/s/AKfycbwQ6xNQukejgjImBGXmLww0ThmSg0z858UdrTDK0QihrUcMH_pts2JLfczWwf6bhEaM/exec';
        fetch(gasUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify(Object.assign({}, experimentData, { experimentEndTimeISO: new Date().toISOString() })) })
            .catch(function(err) { console.warn('[WARNING] fetch:', err); })
            .finally(function() { showScreen(screen5); showLoading(false); });
    });
}

// ===================================================
// アプリ初期化
// ===================================================

function initializeApp() {
    appContainer           = document.getElementById('app');
    screen1                = document.getElementById('screen1');
    screen2                = document.getElementById('screen2');
    screen3                = document.getElementById('screen3');
    screen4                = document.getElementById('screen4');
    screen5                = document.getElementById('screen5');
    subjectNameInput       = document.getElementById('subjectName');
    subjectAgeInput        = document.getElementById('subjectAge');
    subjectEmailInput      = document.getElementById('subjectEmail');
    goToScreen2Btn         = document.getElementById('goToScreen2Btn');
    startExperimentBtn     = document.getElementById('startExperimentBtn');
    canvasContainer        = document.getElementById('canvas-container');
    clusterCanvas          = document.getElementById('clusterCanvas');
    ctx                    = clusterCanvas ? clusterCanvas.getContext('2d') : null;
    finishPlacementBtn     = document.getElementById('finishPlacementBtn');
    goToFeedbackBtn        = document.getElementById('goToFeedbackBtn');
    saveFeedbackAndDataBtn = document.getElementById('saveFeedbackAndDataBtn');
    loadingSpinner         = document.getElementById('loadingSpinner');
    statusMessage          = document.getElementById('statusMessage');
    detailsPanel           = document.getElementById('details-panel');
    backToScreen1Btn       = document.getElementById('backToScreen1Btn');
    backToScreen2Btn       = document.getElementById('backToScreen2Btn');
    backToStartBtn2        = document.getElementById('backToStartBtn2');

    if (subjectAgeInput) {
        subjectAgeInput.addEventListener('input', function(e) {
            e.target.value = e.target.value.replace(/[０-９]/g, function(s) { return String.fromCharCode(s.charCodeAt(0) - 0xFEE0); });
        });
    }

    if (goToScreen2Btn) {
        goToScreen2Btn.addEventListener('click', function() {
            var name   = subjectNameInput.value.trim();
            var ageStr = subjectAgeInput.value.trim();
            var email  = subjectEmailInput.value.trim();
            if (!name || !ageStr || !email) { alert('全ての項目を入力してください。'); return; }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert('有効なメールアドレスを入力してください。'); return; }
            var age = parseInt(ageStr, 10);
            if (isNaN(age) || age < 18 || age > 99) { alert('年齢は18歳から99歳の間で入力してください。'); return; }
            experimentData.subjectInfo = { name: name, age: age, email: email };
            showScreen(screen2); currentMode = 'instructions';
        });
    }

    if (startExperimentBtn) {
        startExperimentBtn.addEventListener('click', function() {
            if (!screen3) return;
            showScreen(screen3);
            try { initializeExperiment(); }
            catch (e) { console.error('[CRITICAL_ERROR]', e); alert('実験初期化エラー。'); }
        });
    }

    if (finishPlacementBtn) {
        finishPlacementBtn.addEventListener('click', function() {
            currentMode = 'clustering'; removeActiveDeleteButton();
            experimentData.placementTime = getCurrentTimestamp();
            experimentData.moveHistory.push({ timestamp: experimentData.placementTime, eventType: 'placementEnd' });
            Object.values(princessContainers).forEach(function(c) { var h = c.querySelector('.drag-handle'); if (h) { h.style.cursor = 'default'; h.onmousedown = null; } });
            displayPrincessDetails(null);
            clusterCanvas.classList.add('active-drawing');
            finishPlacementBtn.style.display = 'none';
            goToFeedbackBtn.style.display    = 'inline-block';
            updateStatusMessage('プリンセスを円で囲んでクラスターを作成（2人以上）、または既存クラスターをクリックして削除できます。');
        });
    }

    if (goToFeedbackBtn) {
        goToFeedbackBtn.addEventListener('click', function() {
            document.body.classList.add('feedback-mode-active');
            currentMode = 'clusterFeedback'; removeActiveDeleteButton();
            updateStatusMessage('作成した各クラスターについて、以下の項目を記入してください。');
            buildClusterFeedbackUI();
            goToFeedbackBtn.style.display       = 'none';
            saveFeedbackAndDataBtn.style.display = 'inline-block';
            clusterCanvas.classList.remove('active-drawing');
            document.querySelectorAll('.food-container .info-button').forEach(function(btn) { btn.style.pointerEvents = 'none'; });
            experimentData.moveHistory.push({ timestamp: getCurrentTimestamp(), eventType: 'enterClusterFeedback', details: { clusterCount: experimentData.clusters.length } });
        });
    }

    if (saveFeedbackAndDataBtn) {
        saveFeedbackAndDataBtn.addEventListener('click', function() {
            var allProvided = experimentData.clusters.every(function(c) {
                return c.feedback && c.feedback.reasonCreated && c.feedback.reasonCreated.trim() &&
                       c.feedback.meaning && c.feedback.meaning.trim() &&
                       c.feedback.reasonName && c.feedback.reasonName.trim();
            });
            if (!allProvided) { alert('全てのクラスターについて、3つのフィードバック項目すべてを記入してください。'); return; }
            buildSurveyUI(); showScreen(screen4);
        });
    }

    if (backToScreen1Btn) { backToScreen1Btn.addEventListener('click', function() { if (confirm('前の画面に戻りますか？')) { showScreen(screen1); currentMode = 'intro'; } }); }
    if (backToScreen2Btn) {
        backToScreen2Btn.addEventListener('click', function() {
            if (confirm('このフェーズを最初からやり直しますか？\n注意：現在の配置やクラスターの情報は全てリセットされます。')) {
                document.body.classList.remove('feedback-mode-active'); resetScreen3UI(); showScreen(screen2); currentMode = 'instructions';
            }
        });
    }
    if (backToStartBtn2) { backToStartBtn2.addEventListener('click', function() { if (confirm('最初の画面に戻りますか？')) { showScreen(screen1); currentMode = 'intro'; } }); }

    if (clusterCanvas) {
        clusterCanvas.addEventListener('mousedown', handleClusterMouseDown);
        clusterCanvas.addEventListener('click',     handleClusterClick);
    }

    showScreen(screen1);
}

document.addEventListener('DOMContentLoaded', initializeApp);
