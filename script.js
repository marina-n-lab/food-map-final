// === Config ===
const PRINCESS_ID = null; // ミートパイのような「中心固定キャラ」なし

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

// 円と矩形の重なり率（0..1）を格子サンプリングで近似
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

// キャンバスサイズは実際の描画サイズに合わせて後で微調整OK
const RING_PADDING = 30;     // 枠からの余白
const MIN_GAP = 12;          // アイコン同士のすき間目安

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
let isSubmitting = false; // 二重送信防止
let recognitionScores = {}; // { princessId: 0..100 }
let currentMode = 'intro';
let princessContainers = {}; // 旧 foodContainers
let isDrawingCluster = false;
let currentDrawingCluster = null;
let activeDeleteButton = null;
let selectedClusterIndexForDeletion = -1;

// プリンセス一覧（旧 foodList）
let princessList = [
    { name: "aurora",      label: "オーロラ姫",   imgSrc: "aurora_738f085c.jpeg",                             info: "眠れる森の美女" },
    { name: "annaandelsa", label: "アナとエルサ", imgSrc: "IMG_9781.JPG",                                     info: "アナと雪の女王" },
    { name: "rapunzel",    label: "ラプンツェル", imgSrc: "rapunzel_8f01586c.jpeg",                           info: "塔の上のラプンツェル" },
    { name: "snow_white",  label: "白雪姫",       imgSrc: "snow_white_37217e1f.jpeg",                         info: "白雪姫" },
    { name: "jasmine",     label: "ジャスミン",   imgSrc: "1280x1280.webp",                                   info: "アラジン" },
    { name: "belle",       label: "ベル",         imgSrc: "belle_a0c06a3b.jpeg",                              info: "美女と野獣" },
    { name: "cinderella",  label: "シンデレラ",   imgSrc: "シンデレラ.jpeg",                                  info: "シンデレラ" },
    { name: "moana",       label: "モアナ",       imgSrc: "モアナ画像_from disneu.co.jp:fc:moana.jpeg",      info: "モアナと伝説の海" },
    { name: "ariel",       label: "アリエル",     imgSrc: "ariel_fc_little-mermaid_t_c2b937fa.jpeg",         info: "リトル・マーメイド" },
];

// 後方互換エイリアス（内部コードで foodList を参照している箇所のため）
let foodList = princessList;

function getCurrentTimestamp() {
    if (!experimentData.startTime) return 0;
    return Math.floor((Date.now() - experimentData.startTime) / 1000);
}

function loadPrincessListFromLocalStorage() {
    try {
        const stored = localStorage.getItem('princessList') || localStorage.getItem('foodList');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                princessList = parsed;
                foodList = princessList;
            }
        }
    } catch (e) { console.error("Error loading princess list:", e); }
}

function showScreen(screenToShow) {
    if (!appContainer || !screenToShow) return;
    [screen1, screen2, screen3, screen4, screen5].forEach(s => {
        if (s) s.classList.remove('active');
    });
    screenToShow.classList.add('active');
    if (!appContainer.classList.contains('active')) {
        appContainer.classList.add('active');
    }
}

function displayPrincessDetails(princess) {
    const nameEl = document.getElementById('details-food-name');
    const imageEl = document.getElementById('details-food-image');
    const infoEl = document.getElementById('details-food-info');
    const placeholderEl = document.getElementById('details-placeholder');

    if (!detailsPanel || !nameEl || !imageEl || !infoEl || !placeholderEl) return;
    if (currentMode === 'clusterFeedback' && detailsPanel.querySelector('.cluster-feedback-item')) return;

    if (!princess) {
        nameEl.textContent = '';
        imageEl.src = '';
        imageEl.style.display = 'none';
        infoEl.innerHTML = '';
        placeholderEl.style.display = 'block';
        detailsPanel.scrollTop = 0;
        Object.values(princessContainers).forEach(pc => pc.classList.remove('selected-food-item'));
        return;
    }
    nameEl.textContent = princess.label;
    imageEl.src = princess.imgSrc;
    imageEl.style.display = 'block';
    infoEl.innerHTML = princess.info ? princess.info.replace(/\n/g, '<br>') : '情報なし';
    placeholderEl.style.display = 'none';
    detailsPanel.scrollTop = 0;
    Object.values(princessContainers).forEach(pc => pc.classList.remove('selected-food-item'));
    if (princessContainers[princess.name]) princessContainers[princess.name].classList.add('selected-food-item');
}

// 後方互換エイリアス
const displayFoodDetails = displayPrincessDetails;

function resetScreen3UI() {
    if (canvasContainer) {
        canvasContainer.querySelectorAll('.food-container').forEach(fc => fc.remove());
    }
    if (ctx && clusterCanvas) {
        ctx.clearRect(0, 0, clusterCanvas.width, clusterCanvas.height);
    }
    princessContainers = {};
    foodContainers = princessContainers;
    experimentData.clusters = [];
    drawAllClusters();

    if (detailsPanel) {
        detailsPanel.innerHTML = `<h3 id="details-food-name"></h3><img id="details-food-image" src="" alt="選択されたプリンセスの画像" style="display:none;"><div id="details-food-info"></div><p id="details-placeholder" class="info-text" style="display:block;">プリンセスの[i]ボタンをクリックすると、ここに詳細情報が表示されます。</p>`;
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

// 内部コードの foodContainers 参照を princessContainers に向ける
Object.defineProperty(window, 'foodContainers', {
    get() { return princessContainers; },
    set(v) { princessContainers = v; }
});

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
            experimentData.moveHistory.push({
                timestamp: experimentData.placementTime,
                eventType: 'placementEnd',
                target: 'finishPlacementBtn',
                details: { message: 'クラスター作成フェーズへ移行' }
            });
            Object.values(princessContainers).forEach(container => {
                const handle = container.querySelector('.drag-handle');
                if (handle) { handle.style.cursor = 'default'; handle.onmousedown = null; }
            });
            displayPrincessDetails(null);
            clusterCanvas.classList.add('active-drawing');
            finishPlacementBtn.style.display = 'none';
            goToFeedbackBtn.style.display = 'inline-block';
            updateStatusMessage('プリンセスを円で囲んでクラスターを作成 (3つ以上中に入れる)、または既存のクラスターをクリックして削除できます。');
        });
    }

    if (goToFeedbackBtn) {
        goToFeedbackBtn.addEventListener('click', () => {
            // プリンセス版ではミートパイのような「必須キャラ」チェックは不要
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
                    if (selectedButton) selectedButton.classList.add('active');

                    const cluster = experimentData.clusters[clusterIndex];
                    const labels = cluster.items.map(item => {
                        const princess = princessList.find(p => p.name === item.name);
                        return princess ? princess.label : item.name;
                    }).join('、 ');
                    const itemsText = labels.length > 0 ? ` (内容: ${labels})` : '';

                    formContainer.innerHTML = `
                        <h4>${cluster.name}${itemsText}</h4>
                        <label for="reasonCreated">このクラスターを作成した理由:</label>
                        <textarea id="reasonCreated" rows="3" placeholder="例：これらは「勇気がある」という点で似ていると感じたため。">${cluster.feedback?.reasonCreated || ''}</textarea>
                        <label for="meaning">どのような意味があると思いますか？:</label>
                        <textarea id="meaning" rows="3" placeholder="例：このグループは「自分の意志で行動するプリンセス」と言えるかもしれません。">${cluster.feedback?.meaning || ''}</textarea>
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

            if (goToFeedbackBtn) goToFeedbackBtn.style.display = 'none';
            if (saveFeedbackAndDataBtn) saveFeedbackAndDataBtn.style.display = 'inline-block';
            if (clusterCanvas) clusterCanvas.classList.remove('active-drawing');
            document.querySelectorAll('.food-container .info-button').forEach(btn => btn.style.pointerEvents = 'none');
            experimentData.moveHistory.push({
                timestamp: getCurrentTimestamp(),
                eventType: 'enterClusterFeedback',
                target: 'application',
                details: { clusterCount: experimentData.clusters.length }
            });
        });
    }

    if (saveFeedbackAndDataBtn) {
        saveFeedbackAndDataBtn.addEventListener('click', () => {
            let allProvided = true;
            for (const cluster of experimentData.clusters) {
                if (!cluster.feedback ||
                    !cluster.feedback.reasonCreated?.trim() ||
                    !cluster.feedback.meaning?.trim() ||
                    !cluster.feedback.reasonName?.trim()) {
                    allProvided = false;
                    break;
                }
            }

            if (!allProvided) {
                alert("全てのクラスターについて、3つのフィードバック項目すべてを記入してください。");
                return;
            }

            const form = document.getElementById('surveyForm');
            if (form) {
                form.innerHTML = `
                <fieldset class="survey-section"><legend>アンケート</legend>

                  <!-- Q1: 実験の楽しさ（1〜5） -->
                  <div class="survey-question">
                    <p class="question-text">Q1. 実験は楽しかったか</p>
                    <div class="likert-scale">
                      <span>全くそう思わない</span>
                      <div class="likert-options">
                        <label><input type="radio" name="q1" value="1" required><span>1</span></label>
                        <label><input type="radio" name="q1" value="2"><span>2</span></label>
                        <label><input type="radio" name="q1" value="3"><span>3</span></label>
                        <label><input type="radio" name="q1" value="4"><span>4</span></label>
                        <label><input type="radio" name="q1" value="5"><span>5</span></label>
                      </div>
                      <span>非常にそう思う</span>
                    </div>
                  </div>

                  <!-- Q2: ディズニープリンセスへの好意（5段階） -->
                  <div class="survey-question">
                    <p class="question-text">Q2. ディズニープリンセスは好きか（5段階）</p>
                    <div class="likert-scale">
                      <span>全く好きではない</span>
                      <div class="likert-options">
                        <label><input type="radio" name="q2" value="1" required><span>1</span></label>
                        <label><input type="radio" name="q2" value="2"><span>2</span></label>
                        <label><input type="radio" name="q2" value="3"><span>3</span></label>
                        <label><input type="radio" name="q2" value="4"><span>4</span></label>
                        <label><input type="radio" name="q2" value="5"><span>5</span></label>
                      </div>
                      <span>非常に好き</span>
                    </div>
                  </div>

                  <!-- Q3: ディズニー物語の中心は恋愛か -->
                  <div class="survey-question">
                    <p class="question-text">Q3. ディズニー物語の中心は恋愛だと思いますか</p>
                    <div class="likert-scale">
                      <span>全くそう思わない</span>
                      <div class="likert-options">
                        <label><input type="radio" name="q3" value="5" required><span>とてもそう思う</span></label>
                        <label><input type="radio" name="q3" value="4"><span>そう思う</span></label>
                        <label><input type="radio" name="q3" value="3"><span>どちらでもない</span></label>
                        <label><input type="radio" name="q3" value="2"><span>そう思わない</span></label>
                        <label><input type="radio" name="q3" value="1"><span>全くそう思わない</span></label>
                      </div>
                    </div>
                  </div>

                  <!-- Q4: 知っているストーリー（複数選択） -->
                  <div class="survey-question">
                    <p class="question-text">Q4. どのストーリーを知っていたか（複数選択可）</p>
                    <div class="checkbox-options">
                      <label><input type="checkbox" name="q4[]" value="aurora">オーロラ姫（眠れる森の美女）</label>
                      <label><input type="checkbox" name="q4[]" value="annaandelsa">アナとエルサ（アナと雪の女王）</label>
                      <label><input type="checkbox" name="q4[]" value="rapunzel">ラプンツェル（塔の上のラプンツェル）</label>
                      <label><input type="checkbox" name="q4[]" value="snow_white">白雪姫</label>
                      <label><input type="checkbox" name="q4[]" value="jasmine">ジャスミン（アラジン）</label>
                      <label><input type="checkbox" name="q4[]" value="belle">ベル（美女と野獣）</label>
                      <label><input type="checkbox" name="q4[]" value="cinderella">シンデレラ</label>
                      <label><input type="checkbox" name="q4[]" value="moana">モアナ</label>
                      <label><input type="checkbox" name="q4[]" value="ariel">アリエル（リトル・マーメイド）</label>
                    </div>
                  </div>

                  <!-- Q5: 現代社会に合うプリンセス（複数選択） -->
                  <div class="survey-question">
                    <p class="question-text">Q5. 現代社会に合っていると思うプリンセスを選んでください（複数選択可）</p>
                    <div class="checkbox-options">
                      <label><input type="checkbox" name="q5[]" value="aurora">オーロラ姫</label>
                      <label><input type="checkbox" name="q5[]" value="annaandelsa">アナとエルサ</label>
                      <label><input type="checkbox" name="q5[]" value="rapunzel">ラプンツェル</label>
                      <label><input type="checkbox" name="q5[]" value="snow_white">白雪姫</label>
                      <label><input type="checkbox" name="q5[]" value="jasmine">ジャスミン</label>
                      <label><input type="checkbox" name="q5[]" value="belle">ベル</label>
                      <label><input type="checkbox" name="q5[]" value="cinderella">シンデレラ</label>
                      <label><input type="checkbox" name="q5[]" value="moana">モアナ</label>
                      <label><input type="checkbox" name="q5[]" value="ariel">アリエル</label>
                    </div>
                  </div>

                  <!-- Q6: 子供に見せたいプリンセス（1つ選択） -->
                  <div class="survey-question">
                    <p class="question-text">Q6. 子供に見せたいプリンセスの物語はどれか（1つ選択）</p>
                    <div class="radio-options">
                      <label><input type="radio" name="q6" value="aurora" required>オーロラ姫（眠れる森の美女）</label>
                      <label><input type="radio" name="q6" value="annaandelsa">アナとエルサ（アナと雪の女王）</label>
                      <label><input type="radio" name="q6" value="rapunzel">ラプンツェル（塔の上のラプンツェル）</label>
                      <label><input type="radio" name="q6" value="snow_white">白雪姫</label>
                      <label><input type="radio" name="q6" value="jasmine">ジャスミン（アラジン）</label>
                      <label><input type="radio" name="q6" value="belle">ベル（美女と野獣）</label>
                      <label><input type="radio" name="q6" value="cinderella">シンデレラ</label>
                      <label><input type="radio" name="q6" value="moana">モアナ</label>
                      <label><input type="radio" name="q6" value="ariel">アリエル（リトル・マーメイド）</label>
                    </div>
                  </div>

                  <!-- Q7: 分類の主な着目点（1つ選択） -->
                  <div class="survey-question">
                    <p class="question-text">Q7. 主にどこに着目して分類したか（1つ選択）</p>
                    <div class="radio-options">
                      <label><input type="radio" name="q7" value="appearance" required>外見</label>
                      <label><input type="radio" name="q7" value="story">ストーリー</label>
                      <label><input type="radio" name="q7" value="personality">性格</label>
                    </div>
                  </div>

                  <!-- Q8: 昔と今のプリンセスの違い -->
                  <div class="survey-question">
                    <p class="question-text">Q8. 昔と今のプリンセスの在り方は違うと思うか</p>
                    <div class="radio-options">
                      <label><input type="radio" name="q8" value="yes" required>はい</label>
                      <label><input type="radio" name="q8" value="no">いいえ</label>
                    </div>
                  </div>

                  <!-- Q9: グループ分けの基準の一貫性 -->
                  <div class="survey-question">
                    <p class="question-text">Q9. グループ分けの基準は一貫していたか、途中で変わったか</p>
                    <div class="radio-options">
                      <label><input type="radio" name="q9" value="consistent" required>一貫していた</label>
                      <label><input type="radio" name="q9" value="changed">途中で変わった</label>
                    </div>
                  </div>

                  <!-- Q10: グループ分けと公開時期の関係 -->
                  <div class="survey-question">
                    <p class="question-text">Q10. あなたのグループ分けは公開時期と関係あると思うか</p>
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

                  <!-- Q11: ディズニープリンセスらしさを一言で -->
                  <div class="survey-question">
                    <p class="question-text">Q11. ディズニープリンセスらしさを一言で言うなら</p>
                    <input type="text" name="q11" id="q11_text" required placeholder="例：夢を持って諦めない" style="width:100%;padding:8px;box-sizing:border-box;margin-top:4px;border:1px solid #ccc;border-radius:4px;">
                  </div>

                  <!-- Q12: 理想のプリンセス像（記述） -->
                  <div class="survey-question">
                    <p class="question-text">Q12. 理想のプリンセス像とはどんなものか（簡単な記述）</p>
                    <textarea name="q12" id="q12_text" required rows="3" placeholder="例：自分の意志で行動し、周囲を思いやれる人" style="width:100%;padding:8px;box-sizing:border-box;margin-top:4px;border:1px solid #ccc;border-radius:4px;"></textarea>
                  </div>

                </fieldset>

                <button id="submitAndFinishBtn" type="submit">アンケートを回答し、データを送信する</button>
                `;

                // 送信ボタンのイベント設定
                const submitAndFinishBtn = document.getElementById('submitAndFinishBtn');
                if (submitAndFinishBtn) {
                    submitAndFinishBtn.addEventListener('click', async (e) => {
                        e.preventDefault();

                        if (isSubmitting) return;
                        isSubmitting = true;

                        submitAndFinishBtn.disabled = true;
                        submitAndFinishBtn.setAttribute('aria-disabled', 'true');
                        const originalLabel = submitAndFinishBtn.textContent;
                        submitAndFinishBtn.textContent = '送信中…（1回だけクリックしてください）';

                        if (!form.checkValidity()) {
                            alert('未回答のアンケート項目があります。全ての項目にご回答ください。');
                            form.reportValidity();
                            isSubmitting = false;
                            submitAndFinishBtn.disabled = false;
                            submitAndFinishBtn.removeAttribute('aria-disabled');
                            submitAndFinishBtn.textContent = originalLabel;
                            return;
                        }

                        // アンケート値を収集
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

                        // 入力の凍結
                        Array.from(form.elements).forEach(el => {
                            if (el !== submitAndFinishBtn) el.disabled = true;
                        });

                        // 距離行列
                        const posMap = {};
                        experimentData.positions.forEach(p => { posMap[p.name] = { x: p.x, y: p.y }; });
                        const princesses = Object.keys(posMap);
                        const distanceMatrix = {};
                        princesses.forEach(a => {
                            distanceMatrix[a] = {};
                            princesses.forEach(b => {
                                const dx = posMap[a].x - posMap[b].x;
                                const dy = posMap[a].y - posMap[b].y;
                                distanceMatrix[a][b] = Math.round(Math.hypot(dx, dy));
                            });
                        });
                        experimentData.distanceMatrix = distanceMatrix;

                        experimentData.survey = surveyData;

                        showLoading(true, "データを送信中...");

                        try {
                            const gasWebAppUrl = 'https://script.google.com/macros/s/AKfycbzrDKs-6wmeHDpyepiQNwW9ZcAAFtPRiasbNJtP8M0Pvlkxh5e04Km7eQh3mK1MOhHV/exec';
                            const dataToSave = { ...experimentData, experimentEndTimeISO: new Date().toISOString() };

                            // 最終配置
                            const finalPositions = [];
                            Object.entries(princessContainers).forEach(([name, el]) => {
                                finalPositions.push({ name, x: el.offsetLeft, y: el.offsetTop });
                            });
                            experimentData.finalPositions = finalPositions;

                            await fetch(gasWebAppUrl, {
                                method: 'POST',
                                mode: 'no-cors',
                                body: JSON.stringify(dataToSave)
                            });

                        } catch (error) {
                            console.warn('[WARNING] fetch failed but probably sent successfully:', error);
                        } finally {
                            showScreen(screen5);
                            showLoading(false);
                        }
                    });
                }
            }
            showScreen(screen4);
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

    try { loadPrincessListFromLocalStorage(); } catch (e) { console.error("Error loading princess list:", e); }
    try {
        if (screen1) showScreen(screen1);
        else { console.error("CRITICAL: screen1 not found!"); alert("初期画面エラー"); }
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

// 中央配置＋リング配置（プリンセスは全員リングに均等配置、中心固定なし）
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

    const names = Object.keys(containersMap);
    const n = names.length;
    if (n === 0) return;

    const neededArc = (Math.max(itemW, itemH) + MIN_GAP) / ringRadius;
    const baseStep = Math.max((2 * Math.PI) / n, neededArc);
    let angle = -Math.PI / 2;

    for (const name of names) {
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
    let lastViewedPrincess = null;
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
        drawAxes();

        experimentData.startTime = Date.now();
        experimentData.moveHistory = [];
        experimentData.clusters = [];
        experimentData.positions = [];

        experimentData.meta = {
            screen: { w: window.innerWidth, h: window.innerHeight },
            canvas: clusterCanvas ? { w: clusterCanvas.width, h: clusterCanvas.height } : null,
            userAgent: navigator.userAgent,
            scriptVersion: 'v11-princess'
        };

        if (detailsPanel) {
            detailsPanel.innerHTML = `<h3 id="details-food-name"></h3><img id="details-food-image" src="" alt="選択されたプリンセスの画像" style="display:none;"><div id="details-food-info"></div><p id="details-placeholder" class="info-text" style="display:block;">プリンセスの[i]ボタンをクリックすると、ここに詳細情報が表示されます。</p>`;
        }
        displayPrincessDetails(null);

        experimentData.moveHistory.push({
            timestamp: 0, eventType: 'experimentStart',
            target: 'experiment', details: { message: '配置フェーズ開始' }
        });
        canvasContainer.querySelectorAll('.food-container').forEach(fc => fc.remove());
        removeActiveDeleteButton();
        princessContainers = {};

        princessList.forEach((princess) => {
            const container = document.createElement('div');
            container.className = 'food-container';
            container.dataset.name = princess.name;

            const dragHandle = document.createElement('div');
            dragHandle.className = 'drag-handle';
            const actionButton = document.createElement('div');
            actionButton.className = 'info-button';
            actionButton.textContent = 'i';
            actionButton.title = `${princess.label}について`;
            dragHandle.appendChild(actionButton);
            container.appendChild(dragHandle);

            const img = document.createElement('img');
            img.src = princess.imgSrc;
            img.alt = princess.label;
            img.className = 'food-image';
            img.onerror = () => { img.alt = `${princess.label} (画像読込失敗)`; };
            container.appendChild(img);
            canvasContainer.appendChild(container);

            princessContainers[princess.name] = container;
            makeDraggable(container, dragHandle, princess, { infoViewStartTime, lastViewedPrincess });
        });

        async function awaitImagesAndArrange() {
            await waitImagesLoaded(canvasContainer);
            arrangeInitialLayout(canvasContainer, princessContainers);

            experimentData.positions = [];
            Object.entries(princessContainers).forEach(([name, el]) => {
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

        updateStatusMessage('プリンセスの青いバーをドラッグして自由に配置してください。');
        if (finishPlacementBtn) finishPlacementBtn.style.display = 'inline-block';
        if (goToFeedbackBtn) goToFeedbackBtn.style.display = 'none';
        if (saveFeedbackAndDataBtn) saveFeedbackAndDataBtn.style.display = 'none';
        if (clusterCanvas) clusterCanvas.classList.remove('active-drawing');
        document.querySelectorAll('.food-container .info-button').forEach(btn => btn.style.pointerEvents = 'auto');
    } catch (error) {
        console.error("[CRITICAL_ERROR] Error within initializeExperiment main block:", error);
        updateStatusMessage("エラー: プリンセスアイテムの配置中に問題が発生しました。");
    }
    console.log('[DEBUG] initializeExperiment finished.');

    experimentData.princessesShown = Array.isArray(princessList) ? princessList.map(p => p.name) : [];
}

function makeDraggable(element, handle, princess, experimentScope) {
    const actionButton = handle.querySelector('.info-button');
    actionButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentMode === 'placement' || currentMode === 'clustering') {
            if (experimentScope.infoViewStartTime && experimentScope.lastViewedPrincess) {
                const duration = Math.floor((Date.now() - experimentScope.infoViewStartTime) / 1000);
                experimentData.moveHistory.push({
                    timestamp: getCurrentTimestamp(),
                    eventType: 'infoViewEnd',
                    target: experimentScope.lastViewedPrincess.name,
                    details: { duration: duration }
                });
            }
            displayPrincessDetails(princess);
            experimentScope.infoViewStartTime = Date.now();
            experimentScope.lastViewedPrincess = princess;
            experimentData.moveHistory.push({
                timestamp: getCurrentTimestamp(),
                eventType: 'infoViewStart',
                target: princess.name
            });
        }
    });

    handle.onmousedown = (e) => {
        if (experimentScope.infoViewStartTime && experimentScope.lastViewedPrincess) {
            const duration = Math.floor((Date.now() - experimentScope.infoViewStartTime) / 1000);
            experimentData.moveHistory.push({
                timestamp: getCurrentTimestamp(),
                eventType: 'infoViewEnd',
                target: experimentScope.lastViewedPrincess.name,
                details: { duration: duration }
            });
            experimentScope.infoViewStartTime = null;
            experimentScope.lastViewedPrincess = null;
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
        if (pE) { pE.x = fX; pE.y = fY; }
        else { experimentData.positions.push({ name: element.dataset.name, x: fX, y: fY }); }
        experimentData.moveHistory.push({
            timestamp: getCurrentTimestamp(),
            eventType: 'dragEnd',
            target: element.dataset.name,
            position: { x: fX, y: fY }
        });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    experimentData.moveHistory.push({
        timestamp: getCurrentTimestamp(),
        eventType: 'dragStart',
        target: element.dataset.name,
        position: { x: iElemX, y: iElemY }
    });
}

function handleClusterMouseDown(e) {
    if (currentMode !== 'clustering' || isDrawingCluster || !clusterCanvas || !ctx) return;
    removeActiveDeleteButton();
    isDrawingCluster = true;
    const rect = clusterCanvas.getBoundingClientRect();
    const startX = e.clientX - rect.left, startY = e.clientY - rect.top;
    currentDrawingCluster = {
        id: `cluster_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: 'circle',
        centerX: startX, centerY: startY, radius: 0,
        name: '', items: [], color: getRandomClusterColor(), feedback: {}
    };
    clusterCanvas.addEventListener('mousemove', handleClusterMouseMove);
    clusterCanvas.addEventListener('mouseup', handleClusterMouseUp);
    clusterCanvas.addEventListener('mouseleave', handleClusterMouseUp);
    experimentData.moveHistory.push({
        timestamp: getCurrentTimestamp(),
        eventType: 'clusterDrawStart',
        target: 'clusterCanvas',
        details: { type: 'circle', centerX: startX, centerY: startY }
    });
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
        currentDrawingCluster = null;
        ctx.clearRect(0, 0, clusterCanvas.width, clusterCanvas.height);
        drawAllClusters();
        return;
    }
    identifyItemsInCluster(currentDrawingCluster);
    if (currentDrawingCluster.items.length < 3) {
        updateStatusMessage(`クラスター内のプリンセスが${currentDrawingCluster.items.length}人です。3人以上になるように作成してください。`);
        experimentData.moveHistory.push({
            timestamp: getCurrentTimestamp(),
            eventType: 'clusterDrawCancel',
            target: 'clusterCanvas',
            details: { message: 'Less than 3 items', itemCount: currentDrawingCluster.items.length }
        });
        currentDrawingCluster = null;
        ctx.clearRect(0, 0, clusterCanvas.width, clusterCanvas.height);
        drawAllClusters();
        return;
    }

    const itemsInCluster = currentDrawingCluster.items.map(item => {
        const princess = princessList.find(p => p.name === item.name);
        return princess ? princess.label : item.name;
    }).join('、 ');

    const confirmationMessage = `以下のプリンセスでクラスターを作成しますか？\n\n【内容】\n${itemsInCluster}`;

    if (confirm(confirmationMessage)) {
        const clusterName = prompt("このクラスターの名前を入力してください:", `クラスター${experimentData.clusters.length + 1}`);
        if (clusterName && clusterName.trim() !== "") {
            currentDrawingCluster.name = clusterName.trim();

            const circle = currentDrawingCluster;
            const enrichedItems = circle.items.map(item => {
                const el = princessContainers[item.name];
                if (!el) return item;
                const rect = getFoodRectAndCenter(el, canvasContainer);
                const distPx = Math.hypot(rect.centerX - circle.centerX, rect.centerY - circle.centerY);
                const overlap = circleRectOverlapRatio(circle.centerX, circle.centerY, circle.radius, rect, 20);
                return {
                    name: item.name,
                    relevance: item.relevance,
                    center: { x: Math.round(rect.centerX), y: Math.round(rect.centerY) },
                    rect: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
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
                details: {
                    id: currentDrawingCluster.id, type: 'circle',
                    radius: currentDrawingCluster.radius,
                    itemCount: currentDrawingCluster.items.length
                }
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

    Object.values(princessContainers).forEach(container => {
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
            const distanceToCenter = Math.sqrt(
                Math.pow(itemCenterX - cluster.centerX, 2) +
                Math.pow(itemCenterY - cluster.centerY, 2)
            );
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
            experimentData.moveHistory.push({
                timestamp: getCurrentTimestamp(),
                eventType: 'clusterDelete',
                target: delCl.name,
                details: { id: delCl.id }
            });
        }
        selectedClusterIndexForDeletion = -1;
        removeActiveDeleteButton();
        drawAllClusters();
    };
}

function removeActiveDeleteButton() {
    if (activeDeleteButton) { activeDeleteButton.remove(); activeDeleteButton = null; }
}

function drawAxes() {

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
    drawAxes();
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
    return `PrincessCognitiveMap_${subjectName}_${dateStr}_${timeStr}.json`;
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

document.addEventListener('DOMContentLoaded', initializeApp);
