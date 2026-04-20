// === Config ===
const MEATPIE_PRICE_JPY = 300;
const MEATPIE_ID = 'australian_meatpie';

// === Helpers for geometry ===
function getFoodRectAndCenter(el, container) {
  const cRect = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const left = r.left - cRect.left;
  const top  = r.top  - cRect.top;
  const width = r.width;
  const height = r.height;
  const centerX = left + width / 2;
  const centerY = top  + height / 2;
  return { left, top, width, height, centerX, centerY };
}

function circleRectOverlapRatio(cx, cy, radius, rect, samplesPerSide = 20) {
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

// DOM要素のキャッシュ
let appContainer, screen1, screen2, screen3, screen4, screen5,
    subjectNameInput, subjectAgeInput, subjectEmailInput, goToScreen2Btn, startExperimentBtn,
    canvasContainer, clusterCanvas, ctx,
    finishPlacementBtn, goToFeedbackBtn, saveFeedbackAndDataBtn, submitAndFinishBtn,
    loadingSpinner, statusMessage, detailsPanel,
    backToScreen1Btn, backToScreen2Btn, backToStartBtn2;

// グローバル変数
let subjectInfo = {};
let experimentData = {
    subjectInfo: {}, positions: [], clusters: [],
    placementTime: null, moveHistory: [], relations: []
};
let isSubmitting = false;
let recognitionScores = {};
let currentMode = 'intro';
let foodContainers = {};
let isDrawingCluster = false;
let currentDrawingCluster = null;
let activeDeleteButton = null;
let selectedClusterIndexForDeletion = -1;

const MEAT_PIE_NAME = "australian_meatpie";
const RING_PADDING = 30;
const MIN_GAP = 12;

let foodList = [
    { name: "aurora", label: "オーロラ姫", imgSrc: "aurora_738f085c.jpeg", info: "「オーロラ姫」" },
    { name: "elsa", label: "アナとエルサ", imgSrc: "IMG_9781.JPG", info: "「アナと雪の女王」" },
    { name: "rapunzel", label: "ラプンツェル", imgSrc: "rapunzel_8f01586c.jpeg", info: "「塔の上のラプンツェル」" },
    { name: "snow_white", label: "白雪姫", imgSrc: "snow_white_37217e1f.jpeg", info: "「白雪姫」" },
    { name: "tiana", label: "ティアナ", imgSrc: "tiana_639e40da.jpeg", info: "「プリンセスと魔法のキス」" },
    { name: "vanellope", label: "ヴァネロペ", imgSrc: "ヴァネロペ.jpeg", info: "「シュガーラッシュ」" },
    { name: "cinderella", label: "シンデレラ", imgSrc: "シンデレラ.jpeg", info: "「シンデレラ」" },
    { name: "jasmine", label: "ジャスミン", imgSrc: "1280x1280.webp", info: "「アラジン」" }
];

function getCurrentTimestamp() {
    if (!experimentData.startTime) return 0;
    return Math.floor((Date.now() - experimentData.startTime) / 1000);
}

function loadFoodListFromLocalStorage() {
    try {
        const storedFoodList = localStorage.getItem('foodList');
        if (storedFoodList) {
            const parsedList = JSON.parse(storedFoodList);
            if (Array.isArray(parsedList) && parsedList.length > 0) {
                foodList = parsedList;
            }
        }
    } catch (e) { console.error("Error loading food list:", e); }
}

function showScreen(screenToShow) {
    if (!appContainer || !screenToShow) return;
    [screen1, screen2, screen3, screen4, screen5].forEach(s => {
        if(s) s.classList.remove('active');
    });
    screenToShow.classList.add('active');
    if (!appContainer.classList.contains('active')) {
      appContainer.classList.add('active');
    }
}

function displayFoodDetails(food) {
    const nameEl = document.getElementById('details-food-name');
    const imageEl = document.getElementById('details-food-image');
    const infoEl = document.getElementById('details-food-info');
    const placeholderEl = document.getElementById('details-placeholder');

    if (!detailsPanel || !nameEl || !imageEl || !infoEl || !placeholderEl) return;
    if (currentMode === 'clusterFeedback' && detailsPanel.querySelector('.cluster-feedback-item')) return;
    
    if (!food) {
        nameEl.textContent = '';
        imageEl.src = '';
        imageEl.style.display = 'none';
        infoEl.innerHTML = '';
        placeholderEl.style.display = 'block';
        detailsPanel.scrollTop = 0;
        Object.values(foodContainers).forEach(fc => fc.classList.remove('selected-food-item'));
        return;
    }
    nameEl.textContent = food.label;
    imageEl.src = food.imgSrc;
    imageEl.style.display = 'block';
    infoEl.innerHTML = food.info ? food.info.replace(/\n/g, '<br>') : '情報なし';
    placeholderEl.style.display = 'none';
    detailsPanel.scrollTop = 0;
    Object.values(foodContainers).forEach(fc => fc.classList.remove('selected-food-item'));
    if (foodContainers[food.name]) foodContainers[food.name].classList.add('selected-food-item');
}

function resetScreen3UI() {
    if (canvasContainer) {
        canvasContainer.querySelectorAll('.food-container').forEach(fc => fc.remove());
    }
    if (ctx && clusterCanvas) {
        ctx.clearRect(0, 0, clusterCanvas.width, clusterCanvas.height);
    }
    foodContainers = {};
    experimentData.clusters = [];
    drawAllClusters();

    if (detailsPanel) {
        detailsPanel.innerHTML = `<h3 id="details-food-name"></h3><img id="details-food-image" src="" alt="選択されたプリンセスの画像" style="display:none;"><div id="details-food-info"></div><p id="details-placeholder" class="info-text" style="display:block;">食品の[i]ボタンをクリックすると、ここに詳細情報が表示されます。</p>`;
    }
    if (statusMessage) updateStatusMessage("");
    if (finishPlacementBtn) finishPlacementBtn.style.display = 'none';
    if (goToFeedbackBtn) goToFeedbackBtn.style.display = 'none';
    if (saveFeedbackAndDataBtn) saveFeedbackAndDataBtn.style.display = 'none';
    if (clusterCanvas) clusterCanvas.classList.remove('active-drawing');
    removeActiveDeleteButton();
    isDrawingCluster = false;
    currentDrawingCluster = null;
}

function initializeApp() {
    console.log("[DEBUG] initializeApp: Starting application initialization.");
    appContainer = document.getElementById('app');
    screen1 = document.getElementById('screen1');
    screen2 = document.getElementById('screen2');
    screen3 = document.getElementById('screen3');
    screen4 = document.getElementById('screen4');
    screen5 = document.getElementById('screen5');
    subjectNameInput = document.getElementById('subjectName');
    subjectAgeInput = document.getElementById('subjectAge');
    subjectEmailInput = document.getElementById('subjectEmail');
    goToScreen2Btn = document.getElementById('goToScreen2Btn');
    startExperimentBtn = document.getElementById('startExperimentBtn');
    canvasContainer = document.getElementById('canvas-container');
    clusterCanvas = document.getElementById('clusterCanvas');
    ctx = clusterCanvas ? clusterCanvas.getContext('2d') : null;
    finishPlacementBtn = document.getElementById('finishPlacementBtn');
    goToFeedbackBtn = document.getElementById('goToFeedbackBtn');
    saveFeedbackAndDataBtn = document.getElementById('saveFeedbackAndDataBtn');
    submitAndFinishBtn = document.getElementById('submitAndFinishBtn');
    loadingSpinner = document.getElementById('loadingSpinner');
    statusMessage = document.getElementById('statusMessage');
    detailsPanel = document.getElementById('details-panel');
    backToScreen1Btn = document.getElementById('backToScreen1Btn');
    backToScreen2Btn = document.getElementById('backToScreen2Btn');
    backToStartBtn2 = document.getElementById('backToStartBtn2');

    if (subjectAgeInput) {
        subjectAgeInput.addEventListener('input', (e) => {
            const halfWidthValue = e.target.value.replace(/[０-９]/g, (s) => {
                return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
            });
            e.target.value = halfWidthValue;
        });
    }

    if (goToScreen2Btn) {
        goToScreen2Btn.addEventListener('click', () => {
            const name = subjectNameInput.value.trim();
            const ageString = subjectAgeInput.value.trim();
            const email = subjectEmailInput.value.trim();
            if (!name || !ageString || !email) { alert("全ての項目を入力してください。"); return; }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert("有効なメールアドレスを入力してください。"); return; }
            const ageNum = parseInt(ageString, 10);
            if (isNaN(ageNum) || ageNum < 18 || ageNum > 99) { alert("年齢は18歳から99歳の間で、有効な数値を入力してください。"); return; }
            experimentData.subjectInfo = { name, age: ageNum, email };
            if (screen2) { showScreen(screen2); currentMode = 'instructions'; }
        });
    }

    if (startExperimentBtn) {
        startExperimentBtn.addEventListener('click', () => {
            if (!screen3) return;
            showScreen(screen3);
            currentMode = 'placement';
            try { initializeExperiment(); }
            catch (e) { console.error('[CRITICAL_ERROR] Error in initializeExperiment:', e); alert("実験初期化エラー。"); }
        });
    }

    if (finishPlacementBtn) {
        finishPlacementBtn.addEventListener('click', () => {
            if (!clusterCanvas || !goToFeedbackBtn) return;
            currentMode = 'clustering';
            removeActiveDeleteButton();
            experimentData.placementTime = getCurrentTimestamp();
            experimentData.moveHistory.push({ timestamp: experimentData.placementTime, eventType: 'placementEnd', target: 'finishPlacementBtn', details: { message: 'クラスター作成フェーズへ移行' } });
            Object.values(foodContainers).forEach(container => {
                const handle = container.querySelector('.drag-handle');
                if (handle) { handle.style.cursor = 'default'; handle.onmousedown = null; }
            });
            displayFoodDetails(null);
            clusterCanvas.classList.add('active-drawing');
            finishPlacementBtn.style.display = 'none';
            goToFeedbackBtn.style.display = 'inline-block';
            updateStatusMessage('プリンセスを円で囲んでクラスターを作成 (3つ以上中に入れる)、または既存のクラスターをクリックして削除できます。');
        });
    }

    // ★ 修正箇所: goToFeedbackBtn のリスナーを正しい括弧構造で記述
    if (goToFeedbackBtn) {
        goToFeedbackBtn.addEventListener('click', () => {
            const hasMeatpie = experimentData.clusters.some(
                c => (c.items || []).some(it => it.name === MEATPIE_ID)
            );
            if (!hasMeatpie) {
                alert('ミートパイを含むクラスターを1つ以上作成してください。');
                return;
            }

            document.body.classList.add('feedback-mode-active');
            currentMode = 'clusterFeedback';
            removeActiveDeleteButton();
            updateStatusMessage('作成した各クラスターについて、以下の項目を記入してください。');

            if (!detailsPanel) {
                console.error("[CRITICAL_ERROR] detailsPanel not found!");
                return;
            }

            detailsPanel.innerHTML = '';
            const infoHeader = document.createElement('p');
            infoHeader.className = 'info-text';
            infoHeader.textContent = '作成した各クラスターについて、以下の項目を記入してください。';
            detailsPanel.appendChild(infoHeader);

            if (experimentData.clusters.length === 0) {
                detailsPanel.innerHTML = '<p class="info-text">作成されたクラスターはありません。このまま次へ進んでください。</p>';
            } else {
                const clusterListContainer = document.createElement('div');
                clusterListContainer.className = 'cluster-list';
                detailsPanel.appendChild(clusterListContainer);

                const formContainer = document.createElement('div');
                formContainer.className = 'cluster-feedback-form';
                detailsPanel.appendChild(formContainer);

                const showClusterFeedback = (clusterIndex) => {
                    clusterListContainer.querySelectorAll('.cluster-list-item').forEach(item => {
                        item.classList.remove('active');
                    });
                    const selectedButton = clusterListContainer.querySelector(`[data-cluster-index="${clusterIndex}"]`);
                    if(selectedButton) selectedButton.classList.add('active');

                    const cluster = experimentData.clusters[clusterIndex];
                    const labels = cluster.items.map(item => {
                        const food = foodList.find(f => f.name === item.name);
                        return food ? food.label : item.name;
                    }).join('、 ');
                    const itemsText = labels.length > 0 ? ` (内容: ${labels})` : '';

                    formContainer.innerHTML = `
                        <h4>${cluster.name}${itemsText}</h4>
                        <label for="reasonCreated">このクラスターを作成した理由:</label>
                        <textarea id="reasonCreated" rows="3" placeholder="例：これらは「見た目」という点で似ていると感じたため。">${cluster.feedback?.reasonCreated || ''}</textarea>
                        <label for="meaning">どのような意味があると思いますか？:</label>
                        <textarea id="meaning" rows="3" placeholder="例：このグループは「子どもが好きな夕食メニュー」と言えるかもしれません。">${cluster.feedback?.meaning || ''}</textarea>
                        <label for="reasonName">その名前にした理由:</label>
                        <textarea id="reasonName" rows="3" placeholder="例：グループの特徴をそのまま名前にしました。">${cluster.feedback?.reasonName || ''}</textarea>
                    `;

                    formContainer.querySelector('#reasonCreated').addEventListener('input', (e) => {
                        if (!cluster.feedback) cluster.feedback = {};
                        cluster.feedback.reasonCreated = e.target.value;
                    });
                    formContainer.querySelector('#meaning').addEventListener('input', (e) => {
                        if (!cluster.feedback) cluster.feedback = {};
                        cluster.feedback.meaning = e.target.value;
                    });
                    formContainer.querySelector('#reasonName').addEventListener('input', (e) => {
                        if (!cluster.feedback) cluster.feedback = {};
                        cluster.feedback.reasonName = e.target.value;
                    });
                };

                experimentData.clusters.forEach((cluster, index) => {
                    const clusterItem = document.createElement('div');
                    clusterItem.className = 'cluster-list-item';
                    clusterItem.textContent = cluster.name;
                    clusterItem.dataset.clusterIndex = index;
                    clusterItem.addEventListener('click', () => showClusterFeedback(index));
                    clusterListContainer.appendChild(clusterItem);
                });

                if (experimentData.clusters.length > 0) {
                    showClusterFeedback(0);
                }
            }

            if(goToFeedbackBtn) goToFeedbackBtn.style.display = 'none';
            if(saveFeedbackAndDataBtn) saveFeedbackAndDataBtn.style.display = 'inline-block';
            if(clusterCanvas) clusterCanvas.classList.remove('active-drawing');
            document.querySelectorAll('.food-container .info-button').forEach(btn => btn.style.pointerEvents = 'none');
            experimentData.moveHistory.push({ timestamp: getCurrentTimestamp(), eventType: 'enterClusterFeedback', target:'application', details: { clusterCount: experimentData.clusters.length } });
        }); // ← goToFeedbackBtn リスナー終了
    }

    if (saveFeedbackAndDataBtn) {
        saveFeedbackAndDataBtn.addEventListener('click', () => {
            let allProvided = true;
            for (const cluster of experimentData.clusters) {
                if (!cluster.feedback || 
                    !cluster.feedback.reasonCreated?.trim() || 
                    !cluster.feedback.meaning?.trim() || 
                    !cluster.feedback.reasonName?.trim()) 
                {
                    allProvided = false;
                    break;
                }
            }

            if (!allProvided) {
                alert("全てのクラスターについて、3つのフィードバック項目すべてを記入してください。");
                return;
            }
            
            const form = document.getElementById('surveyForm');
            if(form) {
                form.innerHTML = `
                <fieldset class="survey-section"><legend>A. 実験の全体的な感想について</legend><div class="survey-question"><p class="question-text">1. 今回の実験は楽しかった</p><div class="likert-scale"><span>全くそう思わない</span><div class="likert-options"><label><input type="radio" name="q1" value="1" required><span>1</span></label><label><input type="radio" name="q1" value="2"><span>2</span></label><label><input type="radio" name="q1" value="3"><span>3</span></label><label><input type="radio" name="q1" value="4"><span>4</span></label><label><input type="radio" name="q1" value="5"><span>5</span></label></div><span>非常にそう思う</span></div></div><div class="survey-question"><p class="question-text">2. 食品を配置する作業は、直感的で分かりやすかった</p><div class="likert-scale"><span>全くそう思わない</span><div class="likert-options"><label><input type="radio" name="q2" value="1" required><span>1</span></label><label><input type="radio" name="q2" value="2"><span>2</span></label><label><input type="radio" name="q2" value="3"><span>3</span></label><label><input type="radio" name="q2" value="4"><span>4</span></label><label><input type="radio" name="q2" value="5"><span>5</span></label></div><span>非常にそう思う</span></div></div><div class="survey-question"><p class="question-text">3. 食品をどこに配置するか、判断に迷うことが多かった</p><div class="likert-scale"><span>全くそう思わない</span><div class="likert-options"><label><input type="radio" name="q3" value="1" required><span>1</span></label><label><input type="radio" name="q3" value="2"><span>2</span></label><label><input type="radio" name="q3" value="3"><span>3</span></label><label><input type="radio" name="q3" value="4"><span>4</span></label><label><input type="radio" name="q3" value="5"><span>5</span></label></div><span>非常にそう思う</span></div></div></fieldset>
                <fieldset class="survey-section"><legend>B. ご自身の思考プロセスや戦略について</legend><div class="survey-question"><p class="question-text">4. 実験を始める前に、ある程度の配置計画を立てていた</p><div class="likert-scale"><span>計画なし</span><div class="likert-options"><label><input type="radio" name="q4" value="1" required><span>1</span></label><label><input type="radio" name="q4" value="2"><span>2</span></label><label><input type="radio" name="q4" value="3"><span>3</span></label><label><input type="radio" name="q4" value="4"><span>4</span></label><label><input type="radio" name="q4" value="5"><span>5</span></label></div><span>綿密に計画</span></div></div><div class="survey-question"><p class="question-text">5. 個々の食品の関係よりも、全体のバランスを考えながら配置した</p><div class="likert-scale"><span>全くそう思わない</span><div class="likert-options"><label><input type="radio" name="q5" value="1" required><span>1</span></label><label><input type="radio" name="q5" value="2"><span>2</span></label><label><input type="radio" name="q5" value="3"><span>3</span></label><label><input type="radio" name="q5" value="4"><span>4</span></label><label><input type="radio" name="q5" value="5"><span>5</span></label></div><span>非常にそう思う</span></div></div><div class="survey-question"><p class="question-text">6. グループ分けをする際、見た目の類似性を重視した</p><div class="likert-scale"><span>全くそう思わない</span><div class="likert-options"><label><input type="radio" name="q6" value="1" required><span>1</span></label><label><input type="radio" name="q6" value="2"><span>2</span></label><label><input type="radio" name="q6" value="3"><span>3</span></label><label><input type="radio" name="q6" value="4"><span>4</span></label><label><input type="radio" name="q6" value="5"><span>5</span></label></div><span>非常にそう思う</span></div></div><div class="survey-question"><p class="question-text">7. グループ分けをする際、味や食文化といった抽象的な関連性を重視した</p><div class="likert-scale"><span>全くそう思わない</span><div class="likert-options"><label><input type="radio" name="q7" value="1" required><span>1</span></label><label><input type="radio" name="q7" value="2"><span>2</span></label><label><input type="radio" name="q7" value="3"><span>3</span></label><label><input type="radio" name="q7" value="4"><span>4</span></label><label><input type="radio" name="q7" value="5"><span>5</span></label></div><span>非常にそう思う</span></div></div><div class="survey-question"><p class="question-text">8. 最終的な食品の配置とグループ分けに、自分自身で納得している</p><div class="likert-scale"><span>全くそう思わない</span><div class="likert-options"><label><input type="radio" name="q8" value="1" required><span>1</span></label><label><input type="radio" name="q8" value="2"><span>2</span></label><label><input type="radio" name="q8" value="3"><span>3</span></label><label><input type="radio" name="q8" value="4"><span>4</span></label><label><input type="radio" name="q8" value="5"><span>5</span></label></div><span>非常にそう思う</span></div></div></fieldset>
                <fieldset class="survey-section">
  <legend>C. あなたの食生活について</legend>
  <div class="survey-question">
    <p class="question-text">9. 普段、どのくらいの頻度で自炊をしますか？</p>
    <div class="likert-scale" id="q9">
      <label><input type="radio" name="q9" value="1" required><span>全くしない</span></label>
      <label><input type="radio" name="q9" value="2"><span>月に数回</span></label>
      <label><input type="radio" name="q9" value="3"><span>週に1-2回</span></label>
      <label><input type="radio" name="q9" value="4"><span>週に3-5回</span></label>
      <label><input type="radio" name="q9" value="5"><span>ほぼ毎日</span></label>
    </div>
  </div>
  <div class="survey-question">
    <p class="question-text">10. 食や料理に対する関心は強い方だ</p>
    <div class="likert-scale">
      <span>全くそう思わない</span>
      <div class="likert-options">
        <label><input type="radio" name="q10" value="1" required><span>1</span></label>
        <label><input type="radio" name="q10" value="2"><span>2</span></label>
        <label><input type="radio" name="q10" value="3"><span>3</span></label>
        <label><input type="radio" name="q10" value="4"><span>4</span></label>
        <label><input type="radio" name="q10" value="5"><span>5</span></label>
      </div>
      <span>非常にそう思う</span>
    </div>
  </div>
  <div class="survey-question">
    <p class="question-text">11. 冷凍食品を食べる機会は多い</p>
    <div class="likert-scale">
      <span>全くそう思わない</span>
      <div class="likert-options">
        <label><input type="radio" name="q11" value="1" required><span>1</span></label>
        <label><input type="radio" name="q11" value="2"><span>2</span></label>
        <label><input type="radio" name="q11" value="3"><span>3</span></label>
        <label><input type="radio" name="q11" value="4"><span>4</span></label>
        <label><input type="radio" name="q11" value="5"><span>5</span></label>
      </div>
      <span>非常にそう思う</span>
    </div>
  </div>
  <div class="survey-question">
    <p class="question-text">12. 以下の各食品について、あなたの「知っている度」をバーで選んでください。</p>
    <p class="info-text">目安：左から「全く知らない｜名前だけ知っている｜食べたことがある｜よく食べる」。直感でOKです。</p>
    <div id="recognition_sliders"></div>
  </div>
</fieldset>
                <button id="submitAndFinishBtn" type="submit">アンケートを回答し、データを送信する</button>
                `;

                // 認知度スライダー生成
                recognitionScores = {};
                const slidersHost = document.getElementById('recognition_sliders');
                if (slidersHost) {
                    foodList.forEach(food => {
                        const row = document.createElement('div');
                        row.className = 'recog-row';

                        const title = document.createElement('p');
                        title.style.margin = '6px 0 4px';
                        title.textContent = food.label;
                        row.appendChild(title);

                        const labels = document.createElement('div');
                        labels.className = 'slider-labels';
                        labels.innerHTML = `
                          <span>全く知らない</span>
                          <span>名前だけ知っている</span>
                          <span>食べたことがある</span>
                          <span>よく食べる</span>
                        `;
                        row.appendChild(labels);

                        const input = document.createElement('input');
                        input.type = 'range';
                        input.className = 'recog-slider';
                        input.min = '0'; input.max = '100'; input.step = '1';
                        input.value = '50';
                        input.setAttribute('aria-label', `${food.label}の認知度`);
                        row.appendChild(input);

                        const ticks = document.createElement('div');
                        ticks.className = 'slider-ticks';
                        row.appendChild(ticks);
                        for (let pct = 0; pct <= 100; pct += 5) {
                            const line = document.createElement('div');
                            line.className = 'tick' + (pct % 10 === 0 ? ' major' : '');
                            line.style.left = `calc(${pct}% - 0.5px)`;
                            ticks.appendChild(line);
                        }
                        ['0','50','100'].forEach(v => {
                            const lab = document.createElement('div');
                            lab.className = 'label';
                            lab.textContent = v;
                            lab.style.left = `calc(${v}% - 0px)`;
                            ticks.appendChild(lab);
                        });

                        const save = () => { recognitionScores[food.name] = parseInt(input.value, 10); };
                        input.addEventListener('input', save);
                        input.addEventListener('change', save);
                        recognitionScores[food.name] = 50;

                        slidersHost.appendChild(row);
                    });
                }

                // 送信ボタンのイベント設定
                const submitBtn = document.getElementById('submitAndFinishBtn');
                if (submitBtn) {
                    submitBtn.addEventListener('click', async (e) => {
                        e.preventDefault();

                        if (isSubmitting) return;
                        isSubmitting = true;

                        submitBtn.disabled = true;
                        submitBtn.setAttribute('aria-disabled', 'true');
                        const originalLabel = submitBtn.textContent;
                        submitBtn.textContent = '送信中…（1回だけクリックしてください）';

                        if (!form.checkValidity()) {
                            alert('未回答のアンケート項目があります。全ての項目にご回答ください。');
                            form.reportValidity();
                            isSubmitting = false;
                            submitBtn.disabled = false;
                            submitBtn.removeAttribute('aria-disabled');
                            submitBtn.textContent = originalLabel;
                            return;
                        }

                        const surveyData = {};
                        const formData = new FormData(form);
                        for (const [key, value] of formData.entries()) {
                            if (key.endsWith('[]')) {
                                const cleanKey = key.slice(0, -2);
                                if (!surveyData[cleanKey]) surveyData[cleanKey] = [];
                                surveyData[cleanKey].push(value);
                            } else {
                                surveyData[key] = value;
                            }
                        }

                        Array.from(form.elements).forEach(el => {
                            if (el !== submitBtn) el.disabled = true;
                        });

                        // 距離行列
                        const posMap = {};
                        experimentData.positions.forEach(p => { posMap[p.name] = { x: p.x, y: p.y }; });
                        const foods = Object.keys(posMap);
                        const distanceMatrix = {};
                        foods.forEach(a => {
                            distanceMatrix[a] = {};
                            foods.forEach(b => {
                                const dx = posMap[a].x - posMap[b].x;
                                const dy = posMap[a].y - posMap[b].y;
                                distanceMatrix[a][b] = Math.round(Math.hypot(dx, dy));
                            });
                        });
                        experimentData.distanceMatrix = distanceMatrix;

                        surveyData.recognition_scores = recognitionScores;
                        experimentData.survey = surveyData;

                        showLoading(true, "データを送信中...");

                        try {
                            const gasWebAppUrl = 'https://script.google.com/macros/s/AKfycbzrDKs-6wmeHDpyepiQNwW9ZcAAFtPRiasbNJtP8M0Pvlkxh5e04Km7eQh3mK1MOhHV/exec';
                            const dataToSave = { ...experimentData, experimentEndTimeISO: new Date().toISOString() };

                            const finalPositions = [];
                            Object.entries(foodContainers).forEach(([name, el]) => {
                                finalPositions.push({ name, x: el.offsetLeft, y: el.offsetTop });
                            });
                            experimentData.finalPositions = finalPositions;

                            function centerOf(el) { return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 }; }
                            const diag = Math.hypot(clusterCanvas.width, clusterCanvas.height);
                            const meatEl = foodContainers['australian_meatpie'];
                            if (meatEl) {
                                const meatC = centerOf(meatEl);
                                const meatpieDistances = {};
                                Object.entries(foodContainers).forEach(([name, el]) => {
                                    if (name === 'australian_meatpie') return;
                                    const c = centerOf(el);
                                    const rawDist = Math.hypot(c.x - meatC.x, c.y - meatC.y);
                                    meatpieDistances[name] = +(rawDist / diag).toFixed(4);
                                });
                                experimentData.meatpieDistances = meatpieDistances;
                            }

                            await fetch(gasWebAppUrl, {
                                method: 'POST',
                                mode: 'no-cors',
                                body: JSON.stringify(dataToSave)
                            });
                        } catch (error) {
                            console.warn('[WARNING] fetch failed but probably sent successfully:', error);
                        } finally {
                            showScreen(screen5);
                            updateStepper(5);
                            showLoading(false);
                        }
                    });
                }
            }
            showScreen(screen4);
            updateStepper(4);
        });
    }

    if (backToScreen1Btn) {
        backToScreen1Btn.addEventListener('click', () => {
            if (confirm("前の画面に戻りますか？")) {
                showScreen(screen1);
                currentMode = 'intro';
            }
        });
    }
    if (backToScreen2Btn) {
        backToScreen2Btn.addEventListener('click', () => {
            if (confirm("このフェーズを最初からやり直しますか？\n注意：現在の配置やクラスターの情報は全てリセットされます。")) {
                document.body.classList.remove('feedback-mode-active');
                resetScreen3UI();
                showScreen(screen2);
                currentMode = 'instructions';
            }
        });
    }
    if (backToStartBtn2) {
        backToStartBtn2.addEventListener('click', () => {
            if (confirm("最初の画面に戻りますか？")) {
                showScreen(screen1);
                currentMode = 'intro';
            }
        });
    }

    if (clusterCanvas) {
        clusterCanvas.addEventListener('mousedown', handleClusterMouseDown);
        clusterCanvas.addEventListener('click', handleClusterClick);
    }

    try { loadFoodListFromLocalStorage(); } catch (e) { console.error("Error loading food list:", e); }
    try {
        if (screen1) showScreen(screen1); else { console.error("CRITICAL: screen1 not found!"); alert("初期画面エラー"); }
    } catch (e) { console.error("Error showing screen1:", e); }
    console.log("[DEBUG] initializeApp: Finished.");
}

function waitImagesLoaded(rootEl) {
    const imgs = Array.from(rootEl.querySelectorAll('img'));
    if (imgs.length === 0) return Promise.resolve();
    let done = 0;
    return new Promise(res => {
        const check = () => { if (++done >= imgs.length) res(); };
        imgs.forEach(img => {
            if (img.complete) check();
            else {
                img.addEventListener('load', check, { once: true });
                img.addEventListener('error', check, { once: true });
            }
        });
    });
}

function arrangeInitialLayout(canvas, containersMap) {
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const cx = W / 2;
    const cy = H / 2;

    const any = Object.values(containersMap)[0];
    const itemW = any ? any.offsetWidth || 96 : 96;
    const itemH = any ? any.offsetHeight || 96 : 96;
    const itemR = Math.max(itemW, itemH) / 2;

    const ringRadius = Math.max(
        120,
        Math.min(W, H) * 0.40 - itemR - RING_PADDING
    );

    const meat = containersMap[MEAT_PIE_NAME];
    if (meat) {
        setCenterPos(meat, cx, cy);
        const dh = meat.querySelector('.drag-handle');
        if (dh) dh.classList.add('is-meatpie');
    }

    const others = Object.keys(containersMap).filter(n => n !== MEAT_PIE_NAME);
    const n = others.length;
    if (n === 0) return;

    const neededArc = (Math.max(itemW, itemH) + MIN_GAP) / ringRadius;
    const baseStep = Math.max((2 * Math.PI) / n, neededArc);
    let angle = -Math.PI / 2;

    for (const name of others) {
        const jitter = (Math.random() - 0.5) * (baseStep * 0.25);
        const a = angle + jitter;
        const x = cx + ringRadius * Math.cos(a);
        const y = cy + ringRadius * Math.sin(a);
        setCenterPos(containersMap[name], x, y);
        angle += baseStep;
    }
}

function setCenterPos(el, cx, cy) {
    const w = el.offsetWidth || 96;
    const h = el.offsetHeight || 96;
    el.style.position = 'absolute';
    el.style.left = `${Math.round(cx - w / 2)}px`;
    el.style.top  = `${Math.round(cy - h / 2)}px`;
}

function initializeExperiment() {
    let infoViewStartTime = null;
    let lastViewedFood = null;
    console.log('[DEBUG] initializeExperiment: Started. Current mode is:', currentMode);
    if (currentMode !== 'placement') {
        currentMode = 'placement';
    }
    if (!canvasContainer || !clusterCanvas || (clusterCanvas && !ctx) || !detailsPanel) {
        updateStatusMessage("エラー: 実験エリアの初期化に失敗しました。");
        return;
    }

    try {
        clusterCanvas.width = canvasContainer.clientWidth;
        clusterCanvas.height = canvasContainer.clientHeight;
        ctx.clearRect(0, 0, clusterCanvas.width, clusterCanvas.height);

        experimentData.startTime = Date.now();
        experimentData.moveHistory = [];
        experimentData.clusters = [];
        experimentData.positions = [];

        experimentData.meta = {
            screen: { w: window.innerWidth, h: window.innerHeight },
            canvas: clusterCanvas ? { w: clusterCanvas.width, h: clusterCanvas.height } : null,
            userAgent: navigator.userAgent,
            scriptVersion: 'v11'
        };

        if (detailsPanel) {
            detailsPanel.innerHTML = `<h3 id="details-food-name"></h3><img id="details-food-image" src="" alt="選択された食品の画像" style="display:none;"><div id="details-food-info"></div><p id="details-placeholder" class="info-text" style="display:block;">食品の[i]ボタンをクリックすると、ここに詳細情報が表示されます。</p>`;
        }
        displayFoodDetails(null);

        experimentData.moveHistory.push({ timestamp: 0, eventType: 'experimentStart', target: 'experiment', details: { message: '配置フェーズ開始' } });
        canvasContainer.querySelectorAll('.food-container').forEach(fc => fc.remove());
        removeActiveDeleteButton();
        foodContainers = {};

        foodList.forEach((food) => {
            const foodContainer = document.createElement('div');
            foodContainer.className = 'food-container';
            foodContainer.dataset.name = food.name;

            const dragHandle = document.createElement('div');
            dragHandle.className = 'drag-handle';
            const actionButton = document.createElement('div');
            actionButton.className = 'info-button'; actionButton.textContent = 'i';
            actionButton.title = `${food.label}について`;
            dragHandle.appendChild(actionButton);
            foodContainer.appendChild(dragHandle);

            const img = document.createElement('img');
            img.src = food.imgSrc; img.alt = food.label; img.className = 'food-image';
            img.onerror = () => { img.alt = `${food.label} (画像読込失敗)`; };
            foodContainer.appendChild(img);
            canvasContainer.appendChild(foodContainer);

            foodContainers[food.name] = foodContainer;
            makeDraggable(foodContainer, dragHandle, food, { infoViewStartTime, lastViewedFood });
        });

        // 画像ロード後に配置を実行
        async function awaitImagesAndArrange() {
            await waitImagesLoaded(canvasContainer);
            arrangeInitialLayout(canvasContainer, foodContainers);

            experimentData.positions = [];
            Object.entries(foodContainers).forEach(([name, el]) => {
                experimentData.positions.push({ name, x: el.offsetLeft, y: el.offsetTop });
                experimentData.moveHistory.push({
                    timestamp: getCurrentTimestamp(),
                    eventType: 'initialPlace',
                    target: name,
                    position: { x: el.offsetLeft, y: el.offsetTop }
                });
            });
        }
        awaitImagesAndArrange();

        experimentData.foodsShown = Array.isArray(foodList) ? foodList.map(f => f.name) : [];

        updateStatusMessage('食品の青いバーをドラッグして自由に配置してください。');
        if (finishPlacementBtn) finishPlacementBtn.style.display = 'inline-block';
        if (goToFeedbackBtn) goToFeedbackBtn.style.display = 'none';
        if (saveFeedbackAndDataBtn) saveFeedbackAndDataBtn.style.display = 'none';
        if (clusterCanvas) clusterCanvas.classList.remove('active-drawing');
        document.querySelectorAll('.food-container .info-button').forEach(btn => btn.style.pointerEvents = 'auto');
    } catch (error) {
        console.error("[CRITICAL_ERROR] Error within initializeExperiment main block:", error);
        updateStatusMessage("エラー: 食品アイテムの配置中に問題が発生しました。");
    }
    console.log('[DEBUG] initializeExperiment finished.');
}

function makeDraggable(element, handle, food, experimentScope) {
    const actionButton = handle.querySelector('.info-button');
    actionButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentMode === 'placement' || currentMode === 'clustering') {
            if (experimentScope.infoViewStartTime && experimentScope.lastViewedFood) {
                const duration = Math.floor((Date.now() - experimentScope.infoViewStartTime) / 1000);
                experimentData.moveHistory.push({
                    timestamp: getCurrentTimestamp(),
                    eventType: 'infoViewEnd',
                    target: experimentScope.lastViewedFood.name,
                    details: { duration: duration }
                });
            }
            displayFoodDetails(food);
            experimentScope.infoViewStartTime = Date.now();
            experimentScope.lastViewedFood = food;
            experimentData.moveHistory.push({
                timestamp: getCurrentTimestamp(),
                eventType: 'infoViewStart',
                target: food.name
            });
        }
    });

    handle.onmousedown = (e) => {
        if (experimentScope.infoViewStartTime && experimentScope.lastViewedFood) {
            const duration = Math.floor((Date.now() - experimentScope.infoViewStartTime) / 1000);
            experimentData.moveHistory.push({
                timestamp: getCurrentTimestamp(),
                eventType: 'infoViewEnd',
                target: experimentScope.lastViewedFood.name,
                details: { duration: duration }
            });
            experimentScope.infoViewStartTime = null;
            experimentScope.lastViewedFood = null;
        }
        onMouseDown(e, element, handle);
    };
}

function onMouseDown(e, element, handle) {
    if (currentMode !== 'placement' || e.button !== 0) {
        handle.style.cursor = 'default';
        return;
    }
    let isDragging = true;
    element.classList.add('dragging');
    handle.style.cursor = 'grabbing';

    let iMouseX = e.clientX;
    let iMouseY = e.clientY;
    let iElemX = element.offsetLeft;
    let iElemY = element.offsetTop;

    const onMouseMove = (moveEvent) => {
        if (!isDragging) return;
        let nX = iElemX + (moveEvent.clientX - iMouseX);
        let nY = iElemY + (moveEvent.clientY - iMouseY);
        nX = Math.max(0, Math.min(nX, canvasContainer.clientWidth - element.offsetWidth));
        nY = Math.max(0, Math.min(nY, canvasContainer.clientHeight - element.offsetHeight));
        element.style.left = `${nX}px`;
        element.style.top = `${nY}px`;
    };

    const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        element.classList.remove('dragging');
        handle.style.cursor = (currentMode === 'placement') ? 'grab' : 'default';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        const fX = element.offsetLeft, fY = element.offsetTop;
        let pE = experimentData.positions.find(p => p.name === element.dataset.name);
        if (pE) {
            pE.x = fX;
            pE.y = fY;
        } else {
            experimentData.positions.push({ name: element.dataset.name, x: fX, y: fY });
        }
        experimentData.moveHistory.push({ timestamp: getCurrentTimestamp(), eventType: 'dragEnd', target: element.dataset.name, position: { x: fX, y: fY } });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    experimentData.moveHistory.push({ timestamp: getCurrentTimestamp(), eventType: 'dragStart', target: element.dataset.name, position: { x: iElemX, y: iElemY } });
}

function handleClusterMouseDown(e) {
    if (currentMode !== 'clustering' || isDrawingCluster || !clusterCanvas || !ctx) return;
    removeActiveDeleteButton(); isDrawingCluster = true;
    const rect = clusterCanvas.getBoundingClientRect();
    const startX = e.clientX - rect.left, startY = e.clientY - rect.top;
    currentDrawingCluster = {
        id: `cluster_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, type: 'circle',
        centerX: startX, centerY: startY, radius: 0,
        name: '', items: [], color: getRandomClusterColor(), feedback: {}
    };
    clusterCanvas.addEventListener('mousemove', handleClusterMouseMove);
    clusterCanvas.addEventListener('mouseup', handleClusterMouseUp);
    clusterCanvas.addEventListener('mouseleave', handleClusterMouseUp);
    experimentData.moveHistory.push({ timestamp: getCurrentTimestamp(), eventType: 'clusterDrawStart', target: 'clusterCanvas', details: { type: 'circle', centerX: startX, centerY: startY } });
}

function handleClusterMouseMove(e) {
    if (!isDrawingCluster || !currentDrawingCluster || currentDrawingCluster.type !== 'circle') return;
    const rect = clusterCanvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left, currentY = e.clientY - rect.top;
    const dx = currentX - currentDrawingCluster.centerX, dy = currentY - currentDrawingCluster.centerY;
    currentDrawingCluster.radius = Math.sqrt(dx * dx + dy * dy);

    ctx.clearRect(0, 0, clusterCanvas.width, clusterCanvas.height);
    drawAllClusters();

    const drawingFillColor = currentDrawingCluster.color.startsWith('rgb(') ?
        currentDrawingCluster.color.replace('rgb(', 'rgba(').replace(')', ', 0.1)') :
        `${currentDrawingCluster.color}1A`;
    drawCircle(currentDrawingCluster.centerX, currentDrawingCluster.centerY, currentDrawingCluster.radius, currentDrawingCluster.color, drawingFillColor, 2, true);
}

function handleClusterMouseUp(e) {
    if (!isDrawingCluster || !currentDrawingCluster || currentDrawingCluster.type !== 'circle') return;
    isDrawingCluster = false;
    clusterCanvas.removeEventListener('mousemove', handleClusterMouseMove);
    clusterCanvas.removeEventListener('mouseup', handleClusterMouseUp);
    clusterCanvas.removeEventListener('mouseleave', handleClusterMouseUp);

    if (currentDrawingCluster.radius < 10) {
        updateStatusMessage('クラスターが小さすぎます。もう一度描画してください。');
        currentDrawingCluster = null; ctx.clearRect(0, 0, clusterCanvas.width, clusterCanvas.height); drawAllClusters(); return;
    }
    identifyItemsInCluster(currentDrawingCluster);
    if (currentDrawingCluster.items.length < 3) {
        updateStatusMessage(`クラスター内の食品が${currentDrawingCluster.items.length}個です。3つ以上になるように作成してください。`);
        experimentData.moveHistory.push({ timestamp: getCurrentTimestamp(), eventType: 'clusterDrawCancel', target: 'clusterCanvas', details: { message: 'Less than 3 items', itemCount: currentDrawingCluster.items.length } });
        currentDrawingCluster = null; ctx.clearRect(0, 0, clusterCanvas.width, clusterCanvas.height); drawAllClusters(); return;
    }
    const itemsInCluster = currentDrawingCluster.items.map(item => {
        const food = foodList.find(f => f.name === item.name);
        return food ? food.label : item.name;
    }).join('、 ');

    const confirmationMessage = `以下の食品でクラスターを作成しますか？\n\n【内容】\n${itemsInCluster}`;

    if (confirm(confirmationMessage)) {
        const clusterName = prompt("このクラスターの名前を入力してください:", `クラスター${experimentData.clusters.length + 1}`);
        if (clusterName && clusterName.trim() !== "") {
            currentDrawingCluster.name = clusterName.trim();

            const circle = currentDrawingCluster;
            const enrichedItems = circle.items.map(item => {
                const el = foodContainers[item.name];
                if (!el) return item;
                const rect = getFoodRectAndCenter(el, canvasContainer);
                const distPx = Math.hypot(rect.centerX - circle.centerX, rect.centerY - circle.centerY);
                const overlap = circleRectOverlapRatio(circle.centerX, circle.centerY, circle.radius, rect, 20);
                return {
                    name: item.name,
                    relevance: item.relevance,
                    center: { x: Math.round(rect.centerX), y: Math.round(rect.centerY) },
                    rect:   { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
                    distToCenterPx: Math.round(distPx),
                    overlapRatio: Number(overlap.toFixed(3))
                };
            });

            currentDrawingCluster.items = enrichedItems;
            currentDrawingCluster.circleArea = Math.round(Math.PI * circle.radius * circle.radius);

            experimentData.clusters.push(currentDrawingCluster);
            experimentData.moveHistory.push({
                timestamp: getCurrentTimestamp(),
                eventType: 'clusterCreated',
                target: currentDrawingCluster.name,
                details: { id: currentDrawingCluster.id, type: 'circle', radius: currentDrawingCluster.radius, itemCount: currentDrawingCluster.items.length }
            });
        } else {
            experimentData.moveHistory.push({
                timestamp: getCurrentTimestamp(),
                eventType: 'clusterDrawCancel',
                target: 'clusterCanvas',
                details: { message: 'No name provided for circle cluster' }
            });
        }
    }
    currentDrawingCluster = null;
    ctx.clearRect(0, 0, clusterCanvas.width, clusterCanvas.height);
    drawAllClusters();
}

function identifyItemsInCluster(cluster) {
    if (!cluster || cluster.type !== 'circle' || cluster.radius <= 0) return;
    cluster.items = [];
    const cRect = canvasContainer.getBoundingClientRect();

    Object.values(foodContainers).forEach(container => {
        const rect = container.getBoundingClientRect();
        const itemLeft = rect.left - cRect.left;
        const itemRight = itemLeft + rect.width;
        const itemTop = rect.top - cRect.top;
        const itemBottom = itemTop + rect.height;

        const closestX = Math.max(itemLeft, Math.min(cluster.centerX, itemRight));
        const closestY = Math.max(itemTop, Math.min(cluster.centerY, itemBottom));
        const dx = cluster.centerX - closestX;
        const dy = cluster.centerY - closestY;
        const distanceToEdge = Math.sqrt((dx * dx) + (dy * dy));

        if (distanceToEdge <= cluster.radius) {
            const itemCenterX = itemLeft + rect.width / 2;
            const itemCenterY = itemTop + rect.height / 2;
            const distanceToCenter = Math.sqrt(Math.pow(itemCenterX - cluster.centerX, 2) + Math.pow(itemCenterY - cluster.centerY, 2));
            const normalizedDistance = Math.min(distanceToCenter, cluster.radius);
            const relevance = Math.round((1 - (normalizedDistance / cluster.radius)) * 100);
            cluster.items.push({ name: container.dataset.name, relevance: relevance });
        }
    });
}

function handleClusterClick(e) {
    if (currentMode !== 'clustering' || isDrawingCluster || !clusterCanvas || !ctx || experimentData.clusters.length === 0) return;
    removeActiveDeleteButton();
    const rect = clusterCanvas.getBoundingClientRect();
    const cX = e.clientX - rect.left, cY = e.clientY - rect.top;
    let clClicked = null, clIdx = -1;
    for (let i = experimentData.clusters.length - 1; i >= 0; i--) {
        const cl = experimentData.clusters[i];
        if (cl.type === 'circle') {
            const dX_ = cX - cl.centerX, dY_ = cY - cl.centerY;
            if (Math.sqrt(dX_ * dX_ + dY_ * dY_) <= cl.radius) { clClicked = cl; clIdx = i; break; }
        }
    }
    if (clClicked) {
        selectedClusterIndexForDeletion = clIdx;
        createAndShowDeleteButton(clClicked, e.clientX, e.clientY);
    }
}

function createAndShowDeleteButton(cluster, screenX, screenY) {
    removeActiveDeleteButton();
    activeDeleteButton = document.createElement('button');
    activeDeleteButton.id = 'dynamicDeleteClusterBtn';
    activeDeleteButton.textContent = `「${cluster.name}」を削除`;
    document.body.appendChild(activeDeleteButton);
    activeDeleteButton.style.left = `${screenX + 5}px`;
    activeDeleteButton.style.top = `${screenY + 5}px`;
    activeDeleteButton.onclick = () => {
        if (selectedClusterIndexForDeletion > -1 && selectedClusterIndexForDeletion < experimentData.clusters.length) {
            const delCl = experimentData.clusters.splice(selectedClusterIndexForDeletion, 1)[0];
            experimentData.moveHistory.push({ timestamp: getCurrentTimestamp(), eventType: 'clusterDelete', target: delCl.name, details: { id: delCl.id } });
        }
        selectedClusterIndexForDeletion = -1;
        removeActiveDeleteButton();
        drawAllClusters();
    };
}

function removeActiveDeleteButton() {
    if (activeDeleteButton) { activeDeleteButton.remove(); activeDeleteButton = null; }
}

function drawCircle(centerX, centerY, radius, strokeStyle, fillStyle, lineWidth, isFilled = true) {
    if (!ctx || radius <= 0) return;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
    if (strokeStyle) ctx.strokeStyle = strokeStyle;
    if (lineWidth) ctx.lineWidth = lineWidth;
    ctx.stroke();
    if (isFilled && fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
}

function drawAllClusters() {
    if (!ctx || !clusterCanvas) return;
    ctx.clearRect(0, 0, clusterCanvas.width, clusterCanvas.height);
    experimentData.clusters.forEach(cluster => {
        if (cluster.type === 'circle' && cluster.radius > 0) {
            const fillColor = cluster.color.startsWith('rgb(') ?
                cluster.color.replace('rgb(', 'rgba(').replace(')', ', 0.2)') :
                `${cluster.color}33`;
            drawCircle(cluster.centerX, cluster.centerY, cluster.radius, cluster.color, fillColor, 2, true);
        }
    });
}

function getRandomClusterColor() {
    const r = Math.floor(Math.random() * 180) + 50;
    const g = Math.floor(Math.random() * 180) + 50;
    const b = Math.floor(Math.random() * 180) + 50;
    return `rgb(${r},${g},${b})`;
}

function generateFileName(info) {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
    const timeStr = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
    const subjectName = info && info.name ? info.name.replace(/\s+/g, '_') : 'UnknownSubject';
    return `FoodCognitiveMap_${subjectName}_${dateStr}_${timeStr}.json`;
}

function showLoading(show, message = '') {
    if (!loadingSpinner || !statusMessage) return;
    if (show) { loadingSpinner.classList.add('active'); statusMessage.textContent = message || '読み込み中...'; }
    else { loadingSpinner.classList.remove('active'); }
}

function updateStatusMessage(message) {
    if (!statusMessage) return;
    statusMessage.textContent = message;
    console.log(`[STATUS] ${message}`);
}

// ★ 重複を削除して1回だけ登録
document.addEventListener('DOMContentLoaded', initializeApp);
