// ==UserScript==
// @name         Vocabulary Helper
// @namespace    http://tampermonkey.net/
// @version      00.00
// @match        *://*.vocabulary.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const SUPABASE_URL = "https://ucergkposclijwyegmbd.supabase.co";
    const SUPABASE_KEY = "sb_publishable_hQw1IjfIupGPeGfo472LZA_0KWvBOdr";

    const canvasHook = document.createElement('script');
    canvasHook.textContent = `
        window.canvasTextBuffer = "";
        const origFillText = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
            if (text && text.trim().length > 1) {
                window.canvasTextBuffer += " " + text.trim();
                let words = window.canvasTextBuffer.split(" ");
                if (words.length > 60) window.canvasTextBuffer = words.slice(-60).join(" ");
                if (document.body) document.body.setAttribute('data-canvas-text', window.canvasTextBuffer);
            }
            origFillText.apply(this, [text, ...args]);
        };
    `;
    document.documentElement.appendChild(canvasHook);
    canvasHook.remove();

    // FIXED: Replaced GM_addStyle with native standard JS implementation
    const customCss = `
        #custom-settings-btn { position: fixed; bottom: 20px; right: 20px; z-index: 99999; padding: 10px 15px; background-color: #2c3e50; color: white; border: none; border-radius: 8px; cursor: pointer; font-family: Arial, sans-serif; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
        #custom-settings-btn:hover { background-color: #34495e; }
        #custom-settings-panel { display: none; position: fixed; bottom: 70px; right: 20px; z-index: 99999; width: 280px; max-height: 80vh; overflow-y: auto; background-color: white; border: 2px solid #2c3e50; border-radius: 8px; padding: 15px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-family: Arial, sans-serif; color: #333; }
        #custom-settings-panel h3 { margin-top: 0; border-bottom: 1px solid #ccc; padding-bottom: 5px; cursor: grab; user-select: none; }
        #custom-settings-panel h3:active { cursor: grabbing; }
        .action-btn { padding: 6px 12px; margin-bottom: 8px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%; font-weight: bold; }
        .toggle-container { margin: 10px 0; display: flex; align-items: center; justify-content: space-between; font-size: 14px;}
        .def-match-badge { color: #27ae60; font-weight: bold; font-size: 0.9em; background: #eaeee8; padding: 4px 8px; border-radius: 6px; pointer-events: none; display: inline-block; margin-top: 5px; }
        .learned-badge { color: #8e44ad !important; background: #f4ebf9 !important; }
        .cloud-badge { color: #0984e3 !important; background: #dfe6e9 !important; border: 1px solid #74b9ff; }
        .cloud-badge-orange { color: #d35400 !important; background: #fdebd0 !important; border: 1px solid #f39c12; }
        .cloud-badge-grey { color: #555 !important; background: #e0e0e0 !important; border: 1px solid #ccc; }
        #spelling-helper-container { margin-top: 15px; border-top: 1px solid #ccc; padding-top: 10px; display: none; }
        #spelling-word-list { max-height: 180px; overflow-y: auto; padding-right: 5px; }
        #spelling-word-list::-webkit-scrollbar { width: 6px; }
        #spelling-word-list::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 4px; }
        #spelling-word-list::-webkit-scrollbar-thumb { background: #bdc3c7; border-radius: 4px; }
        #spelling-word-list::-webkit-scrollbar-thumb:hover { background: #95a5a6; }
        .spelling-word { display: inline-block; background: #e1f0fa; color: #2980b9; padding: 5px 10px; margin: 3px; border-radius: 4px; font-size: 13px; font-weight: bold; cursor: pointer; border: 1px solid #b9d8f0; transition: background 0.2s; }
        .spelling-word:hover { background: #b9d8f0; }
        .dimmed-disabled { pointer-events: none !important; opacity: 0.55 !important; transition: opacity 0.3s ease; }
    `;
    const styleElement = document.createElement('style');
    styleElement.type = 'text/css';
    styleElement.textContent = customCss;
    (document.head || document.documentElement).appendChild(styleElement);

    const stopWords = ['the','a','an','and','or','but','if','because','as','what','when','where','how','who','which','this','that','these','those','then','just','so','than','such','both','through','about','for','is','of','while','during','to','from','in','out','into','over','under','with','either','mentally','physically','cause','someone','something','make','has','have','had','do','does','did','be','been','being'];

    window.lastActiveInput = null;

    function getMemory() {
        let mem = JSON.parse(GM_getValue('vocabMemory', '{}'));
        for (let key in mem) {
            if (typeof mem[key] === 'string') {
                mem[key] = { answer: mem[key], type: 'Multiple Choice' };
            }
        }
        return mem;
    }

    function updateMemoryUI() {
        const memory = getMemory();
        let scrapedCount = 0;
        for (let key in memory) {
            if (memory[key].scraped) scrapedCount++;
        }

        const statusEl = document.getElementById('memory-status-count');
        if (statusEl) statusEl.innerText = scrapedCount;

        const listIdEl = document.getElementById('current-list-id-display');
        const storedListId = GM_getValue('vocabListId', '');
        if (listIdEl) listIdEl.innerText = storedListId || 'None';
    }

    function syncCloud(listId) {
        if (!listId || SUPABASE_URL.includes("YOUR_SUPABASE_URL")) return;

        GM_xmlhttpRequest({
            method: "GET",
            url: `${SUPABASE_URL}/rest/v1/vocab_entries?list_id=eq.${String(listId)}&select=*`,
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Accept": "application/json"
            },
            onload: function(res) {
                const cloudCountEl = document.getElementById('cloud-status-count');
                if (res.status === 200) {
                    try {
                        let dataArray = JSON.parse(res.responseText);
                        let localMemory = getMemory();

                        dataArray.forEach(row => {
                            if (!localMemory[row.question]) {
                                localMemory[row.question] = {
                                    answer: row.answer,
                                    type: row.question_type || 'Multiple Choice'
                                };
                            } else {
                                localMemory[row.question].answer = row.answer;
                                localMemory[row.question].type = row.question_type || 'Multiple Choice';
                            }
                        });

                        GM_setValue('vocabMemory', JSON.stringify(localMemory));
                        updateMemoryUI();

                        if (cloudCountEl) {
                            cloudCountEl.innerText = dataArray.length;
                            cloudCountEl.style.color = "#0984e3";
                        }
                    } catch(e) {}
                }
            }
        });
    }

    function pushToCloud(listId, exactQuestionText, exactAnswerText, qType) {
        if (!listId || !exactQuestionText || !exactAnswerText || SUPABASE_URL.includes("YOUR_SUPABASE_URL")) return;
        if (exactQuestionText.trim() === "" || exactAnswerText.trim() === "") return;

        let payload = [{
            list_id: String(listId),
            question: String(exactQuestionText),
            answer: String(exactAnswerText),
            question_type: String(qType)
        }];

        GM_xmlhttpRequest({
            method: "POST",
            url: `${SUPABASE_URL}/rest/v1/vocab_entries?on_conflict=list_id,question`,
            data: JSON.stringify(payload),
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates"
            },
            onload: function(res) {
                if(res.status === 201 || res.status === 200 || res.status === 204) {
                    syncCloud(listId);
                }
            }
        });
    }

    function typeInCanvas(canvas, word) {
        canvas.focus();
        for (let i = 0; i < word.length; i++) {
            let char = word[i];
            let keyCode = char.toUpperCase().charCodeAt(0);
            let evOpt = { bubbles: true, cancelable: true, key: char, code: 'Key' + char.toUpperCase(), keyCode: keyCode, which: keyCode };
            canvas.dispatchEvent(new KeyboardEvent('keydown', evOpt));
            canvas.dispatchEvent(new KeyboardEvent('keypress', evOpt));
            canvas.dispatchEvent(new KeyboardEvent('keyup', evOpt));
        }
        setTimeout(() => {
            canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 13, key: 'Enter' }));
        }, 300);
    }

    function renderSpellingWords(words) {
        const container = document.getElementById('spelling-word-list');
        if (!container) return;
        container.innerHTML = '';
        words.forEach(w => {
            const span = document.createElement('span');
            span.className = 'spelling-word';
            span.innerText = w;
            span.onclick = () => {
                let targetInput = window.lastActiveInput;

                if (!targetInput || !document.body.contains(targetInput)) {
                    let containers = Array.from(document.querySelectorAll('.questionPane, .challenge-slide')).filter(c => c.offsetParent !== null);
                    let activeContainer = containers.pop() || document.body;
                    targetInput = activeContainer.querySelector('input[type="text"]:not([id*="search"])');
                }

                if (targetInput) {
                    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                    nativeSetter.call(targetInput, w);
                    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                    targetInput.dispatchEvent(new Event('change', { bubbles: true }));
                    targetInput.focus();
                    setTimeout(() => {
                        targetInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 13, key: 'Enter' }));
                        let spellitBtn = document.querySelector('.spellit, .next, .btn-next');
                        if(spellitBtn) spellitBtn.click();
                    }, 100);
                } else {
                    let activeCanvas = document.querySelector('canvas');
                    if (activeCanvas) {
                        typeInCanvas(activeCanvas, w);
                    }
                }
                updateSpellingFilter("");
            };
            container.appendChild(span);
        });
    }

    function updateSpellingFilter(typedString) {
        const memory = getMemory();
        let spellingAnswers = [];
        for (let key in memory) {
            if (memory[key].scraped) {
                if (key && key.length < 35 && !key.includes(' ') && !spellingAnswers.includes(key)) {
                    spellingAnswers.push(key);
                }
                if (memory[key].type === 'Spelling') {
                    let ans = memory[key].answer;
                    if (ans && ans.length < 35 && !ans.includes(' ') && !spellingAnswers.includes(ans)) {
                        spellingAnswers.push(ans);
                    }
                }
            }
        }

        let typed = (typedString || "").toLowerCase().trim();
        let matches = spellingAnswers;
        if (typed.length > 0) {
            matches = spellingAnswers.filter(w => w.includes(typed));
        }
        renderSpellingWords(matches);
    }

    function cleanQuestionText(rawText) {
        if (!rawText) return "";
        let text = rawText.replace(/\n/g, " ");
        text = text.replace(/source:.*$/gi, "");
        text = text.replace(/not sure\?.*$/gi, "");
        text = text.replace(/get a hint.*$/gi, "");
        text = text.replace(/(assessment|brush-up|review|practice|mastery).*?\d+\s*points?/gi, "");

        text = text.replace(/[^a-z0-9 \-]/gi, "").replace(/\s+/g, " ").trim().toLowerCase();

        return text.substring(0, 700);
    }

    async function fetchAdvancedData(word) {
        const cacheKey = 'advcache_v6_' + word;
        const cached = GM_getValue(cacheKey);
        if (cached) return JSON.parse(cached);

        let advancedWords = [];
        let defTextPool = "";
        let exampleTextPool = "";
        let shortDef = "";

        const url = `https://www.vocabulary.com/dictionary/${encodeURIComponent(word)}`;
        try {
            const resp = await fetch(url);
            if (resp.ok) {
                const text = await resp.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, 'text/html');

                const shortNode = doc.querySelector('.short');
                if (shortNode) shortDef = shortNode.innerText.trim();

                doc.querySelectorAll(".definition, .short, .long").forEach(d => defTextPool += " " + d.innerText);
                doc.querySelectorAll(".sentence, .example, q").forEach(e => exampleTextPool += " " + e.innerText);
                const instances = doc.querySelectorAll("div.div-replace-dl.instances");
                instances.forEach(instance => {
                    const detailSpan = instance.querySelector("span.detail");
                    if (detailSpan) {
                        const headerText = detailSpan.textContent.trim().toLowerCase();
                        if (headerText.includes("synonyms") || headerText.includes("antonyms") || headerText.includes("types")) {
                            instance.querySelectorAll("a.word").forEach(a => {
                                advancedWords.push(a.textContent.trim().toLowerCase());
                            });
                        }
                    }
                });
            }
        } catch (err) {}

        try {
            const fdResp = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
            if (fdResp.ok) {
                let fdData = await fdResp.json();
                fdData.forEach(entry => {
                    entry.meanings.forEach(meaning => {
                        if (meaning.synonyms) meaning.synonyms.forEach(s => advancedWords.push(s.toLowerCase()));
                        if (meaning.antonyms) meaning.antonyms.forEach(a => advancedWords.push(a.toLowerCase()));
                        if (meaning.definitions) {
                            meaning.definitions.forEach(d => {
                                if (!shortDef) shortDef = d.definition;
                                defTextPool += " " + d.definition;
                                if (d.example) exampleTextPool += " " + d.example;
                                if (d.synonyms) d.synonyms.forEach(s => advancedWords.push(s.toLowerCase()));
                                if (d.antonyms) d.antonyms.forEach(a => advancedWords.push(a.toLowerCase()));
                            });
                        }
                    });
                });
            }
        } catch (err) {}

        try {
            const mlResp = await fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(word)}&md=d`);
            if (mlResp.ok) {
                let mls = await mlResp.json();
                mls.slice(0, 30).forEach(m => {
                    advancedWords.push(m.word.toLowerCase());
                    if (m.defs) {
                        m.defs.forEach(d => {
                            let cleanData = d.replace(/^[a-z]+\t/, '');
                            if (!shortDef) shortDef = cleanData;
                            defTextPool += " " + cleanData;
                        });
                    }
                });
            }
            const synResp = await fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}`);
            if (synResp.ok) {
                let syns = await synResp.json();
                syns.forEach(s => advancedWords.push(s.word.toLowerCase()));
            }
            const antResp = await fetch(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(word)}`);
            if (antResp.ok) {
                let ants = await antResp.json();
                ants.forEach(a => advancedWords.push(a.word.toLowerCase()));
            }
        } catch (err) {}

        try {
            const wkResp = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`);
            if (wkResp.ok) {
                let wkData = await wkResp.json();
                for (let lang in wkData) {
                    wkData[lang].forEach(pos => {
                        pos.definitions.forEach(d => {
                            let div = document.createElement('div');
                            div.innerHTML = d.definition;
                            defTextPool += " " + div.innerText;
                            if (d.examples) {
                                d.examples.forEach(ex => {
                                    let ediv = document.createElement('div');
                                    ediv.innerHTML = ex.text || ex;
                                    exampleTextPool += " " + ediv.innerText;
                                });
                            }
                        });
                    });
                }
            }
        } catch (err) {}

        let uniqueWords = Array.from(new Set(advancedWords)).filter(w => w.length > 1);
        let defTokens = Array.from(new Set(defTextPool.toLowerCase().split(/\W+/).filter(t => t.length > 2 && !stopWords.includes(t))));
        let exampleTokens = Array.from(new Set(exampleTextPool.toLowerCase().split(/\W+/).filter(t => t.length > 2 && !stopWords.includes(t))));

        let result = { words: uniqueWords, defTokens: defTokens, exampleTokens: exampleTokens, shortDef: shortDef };
        GM_setValue(cacheKey, JSON.stringify(result));
        return result;
    }

    async function scrapeListData(listId) {
        const cleanUrl = `https://www.vocabulary.com/lists/${listId}`;
        const btn = document.getElementById('scrape-list-btn');
        if (btn) btn.innerText = "Scraping...";

        try {
            const response = await fetch(cleanUrl);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const entries = doc.querySelectorAll('[data-word], [word], li.entry, tr.entry, .wordlist li');

            GM_setValue('vocabMemory', '{}');
            let memory = {};

            entries.forEach(entry => {
                let rawWord = entry.getAttribute('word') || entry.getAttribute('data-word');
                if (!rawWord) {
                    const wordEl = entry.querySelector('.word');
                    if (wordEl) rawWord = wordEl.childNodes[0] ? wordEl.childNodes[0].textContent : wordEl.innerText;
                }

                const defEl = entry.querySelector('.definition');
                let cleanDef = "";
                if (defEl) cleanDef = defEl.innerText.trim().toLowerCase();

                if (rawWord) {
                    let cleanKey = cleanQuestionText(rawWord);
                    if (cleanKey.length > 1 && /[a-z]/i.test(cleanKey)) {
                        memory[cleanKey] = { answer: cleanDef || cleanKey, type: 'Multiple Choice', scraped: true };
                    }
                }
            });

            GM_setValue('vocabMemory', JSON.stringify(memory));
            updateMemoryUI();
            updateSpellingFilter("");

            if (btn) {
                btn.innerText = `Scraped!`;
                setTimeout(() => {
                    if (document.getElementById('scrape-list-btn')) {
                        document.getElementById('scrape-list-btn').innerText = "Scrape Background List";
                    }
                }, 2500);
            }
        } catch (error) {
            if (btn) {
                btn.innerText = "Error! Try Again";
                setTimeout(() => {
                    if (document.getElementById('scrape-list-btn')) {
                        document.getElementById('scrape-list-btn').innerText = "Scrape Background List";
                    }
                }, 2500);
            }
        }
    }

    function safeClick(element) {
        if (!element) return;

        let pLink = element.closest('a');
        if (pLink) {
            pLink.removeAttribute('href');
            pLink.removeAttribute('target');
        }

        if (element.querySelectorAll) {
            element.querySelectorAll('a').forEach(a => {
                a.removeAttribute('href');
                a.removeAttribute('target');
            });
        }

        element.click();
    }

    function triggerCanvasRightArrow() {
        document.querySelectorAll('canvas').forEach(c => {
            if (!c.hasAttribute('tabindex')) {
                c.setAttribute('tabindex', '0');
            }
            c.focus();

            let arrowEvent = new KeyboardEvent('keydown', {
                bubbles: true,
                cancelable: true,
                key: 'ArrowRight',
                code: 'ArrowRight',
                keyCode: 39
            });
            c.dispatchEvent(arrowEvent);

            document.dispatchEvent(new KeyboardEvent('keydown', {
                bubbles: true,
                cancelable: true,
                key: 'ArrowRight',
                code: 'ArrowRight',
                keyCode: 39
            }));
        });
    }

    let isProcessing = false;

    async function processActiveQuestion() {
        let allContainers = Array.from(document.querySelectorAll('.questionPane, .challenge-slide'));
        let visibleContainers = allContainers.filter(c => c.offsetParent !== null);
        let qContainer = visibleContainers.pop();

        if (!qContainer) {
            document.getElementById('spelling-helper-container').style.display = 'none';
            return;
        }

        if (!qContainer.dataset.cachedQuestion) {
            let cloneForCache = qContainer.cloneNode(true);
            let choicesToRemove = cloneForCache.querySelector('.choices');
            if (choicesToRemove) choicesToRemove.remove();

            let rawText = cloneForCache.innerText || cloneForCache.textContent || "";
            qContainer.dataset.cachedQuestion = cleanQuestionText(rawText);
        }

        let exactQuestion = qContainer.dataset.cachedQuestion;
        let targetWord = cleanQuestionText(qContainer.querySelector('strong, b, .word, h1')?.innerText || "");
        let isDefQuestion = /(mean|define|definition|meaning|refers to|is defined as|describe)/i.test(exactQuestion);
        let isExampleQuestion = /(which of the following|what of the following|is an example of|which sentence|illustrates the word)/i.test(exactQuestion);

        const memory = getMemory();
        let knownWordsList = [];
        for (let k in memory) {
            if (memory[k].scraped) knownWordsList.push(k);
        }

        let isSolved = false;
        let finalAnswer = "";
        let successElement = null;

        const currentChoices = Array.from(qContainer.querySelectorAll('.choice, .choices a, .choices button, .choices li')).filter(el => {
            if (el.closest('footer, nav, header')) return false;

            if (el.tagName.toLowerCase() === 'a' && el.href && el.href.includes('/dictionary/')) return false;
            if (el.getAttribute('href') && el.getAttribute('href').includes('/dictionary/')) return false;

            return el.innerText.trim().length > 1 && !el.innerText.includes('scrape');
        });

        let wrongChoices = [];
        let currentQType = currentChoices.length > 0 ? 'Multiple Choice' : 'Spelling';

        if (currentQType === 'Spelling') {
            document.getElementById('spelling-helper-container').style.display = 'block';
            if (!qContainer.dataset.spellingInitialized) {
                qContainer.dataset.spellingInitialized = 'true';
                updateSpellingFilter("");
            }
        } else {
            document.getElementById('spelling-helper-container').style.display = 'none';
        }

        if (currentQType === 'Spelling' && !qContainer.dataset.audioLoop) {
            qContainer.dataset.audioLoop = 'true';
            let audioBtn = qContainer.querySelector('a.audio, button.audio, .play-audio, i.icon-audio, [data-audio]');
            if (audioBtn) {
                audioBtn.click();
                let loopCount = 0;
                let playInterval = setInterval(() => {
                    let currentInput = qContainer.querySelector('input[type="text"]:not([id*="search"])');
                    let isNowSolved = qContainer.querySelector('.correct, .expected, .correct-answer, .right-answer') || (currentInput && currentInput.disabled);

                    if (!document.body.contains(audioBtn) || isNowSolved || loopCount > 10) {
                        clearInterval(playInterval);
                    } else {
                        audioBtn.click();
                        loopCount++;
                    }
                }, 3000);
            }
        }

        if (currentChoices.length > 0) {
            currentChoices.forEach(c => {
                let right = false;
                let wrong = false;

                if (c.classList.contains('correct') || c.classList.contains('expected')) right = true;
                if (c.classList.contains('incorrect') || c.classList.contains('rejected')) wrong = true;
                if (c.querySelector('.correct, .expected, i.icon-correct')) right = true;
                if (c.querySelector('.incorrect, .rejected, i.icon-incorrect')) wrong = true;

                if (right && !wrong) {
                    isSolved = true;
                    successElement = c;

                    let cloneC = c.cloneNode(true);
                    let b = cloneC.querySelector('.def-match-badge');
                    if (b) b.remove();
                    finalAnswer = cloneC.innerText.trim().toLowerCase();
                } else if (wrong) {
                    wrongChoices.push(c);
                }
            });
        }

        wrongChoices.forEach(c => {
            const badge = c.querySelector('.def-match-badge');
            if (badge) badge.remove();
            c.dataset.tagged = 'wrong';
        });

        let spellingInput = qContainer.querySelector('input[type="text"]:not([id*="search"])');
        if (!isSolved && spellingInput) {
            let spellContainer = spellingInput.closest('.word-input, .questionPane, .challenge-slide') || spellingInput.parentElement;
            let classes = ((spellingInput.className || "") + " " + (spellContainer ? spellContainer.className : "")).toLowerCase();
            let expectedDiv = qContainer.querySelector('.expected, .correct-answer, .answer-word, .right-answer');

            if (classes.includes('correct') || classes.includes('expected') || spellingInput.disabled || expectedDiv) {
                isSolved = true;
                successElement = spellingInput.parentElement;

                if (expectedDiv && expectedDiv.innerText.trim().length > 1) {
                    finalAnswer = expectedDiv.innerText.trim().toLowerCase();
                } else {
                    finalAnswer = spellingInput.value.trim().toLowerCase();
                }
            }
        }

        if (isSolved && currentQType === 'Spelling') {
            let sentenceEl = qContainer.querySelector('.sentence');
            let boldEl = qContainer.querySelector('.sentence strong, .sentence b, .sentence .word');

            if (sentenceEl && boldEl) {
                exactQuestion = cleanQuestionText(sentenceEl.innerText);
                finalAnswer = cleanQuestionText(boldEl.innerText);
            }
        }

        if (isSolved && finalAnswer && exactQuestion && exactQuestion.length > 2) {
            qContainer.classList.add('dimmed-disabled');
            if (exactQuestion !== finalAnswer && targetWord !== finalAnswer) {
                if (successElement && !successElement.dataset.learned) {

                    let existing = memory[exactQuestion];
                    if (existing && existing.answer === finalAnswer && existing.type === currentQType) {
                        successElement.dataset.learned = 'true';
                    } else {
                        memory[exactQuestion] = { answer: finalAnswer, type: currentQType };

                        const currentListId = GM_getValue('vocabListId', '');
                        if (currentListId && currentQType !== 'Spelling') {
                            pushToCloud(currentListId, exactQuestion, finalAnswer, currentQType);
                        }

                        GM_setValue('vocabMemory', JSON.stringify(memory));
                        updateMemoryUI();

                        document.querySelectorAll('.def-match-badge').forEach(b => b.remove());
                        const badge = document.createElement('div');
                        badge.innerText = currentQType === 'Spelling' ? 'Saved to Local Memory' : 'Saved to Memory & Cloud';
                        badge.className = 'def-match-badge learned-badge';
                        successElement.appendChild(badge);
                        successElement.dataset.learned = 'true';
                    }
                }
            }

            if (currentQType === 'Spelling' && GM_getValue('autoClickEnabled', false) && !qContainer.dataset.autoAdvanced) {
                qContainer.dataset.autoAdvanced = 'true';
                setTimeout(() => {
                    let nextBtn = document.querySelector('.next, .btn-next, .spellit');
                    if (nextBtn) {
                        safeClick(nextBtn);
                    } else if (spellingInput) {
                        spellingInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 13, key: 'Enter' }));
                    } else {
                        let activeCanvas = document.querySelector('canvas');
                        if (activeCanvas) {
                            activeCanvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 13, key: 'Enter' }));
                        }
                    }
                    setTimeout(() => { triggerCanvasRightArrow(); }, 1500);
                }, 1000);
            }

            return;
        }

        const autoClickEnabled = GM_getValue('autoClickEnabled', false);

        if (currentChoices.length > 0 && !isSolved) {
            qContainer.classList.add('dimmed-disabled');

            let bestMatch = null;
            let maxScore = 0;

            let memExactObj = memory[exactQuestion];
            let memTargetObj = memory[targetWord];

            let memExact = memExactObj && memExactObj.type === 'Multiple Choice' ? memExactObj.answer : "";
            let memTarget = memTargetObj && memTargetObj.type === 'Multiple Choice' ? memTargetObj.answer : "";

            let advancedData = { words: [], defTokens: [], exampleTokens: [], shortDef: "" };
            if (targetWord) {
                advancedData = await fetchAdvancedData(targetWord);
                if (isExampleQuestion && advancedData.shortDef && !qContainer.querySelector('.top-def-bar')) {
                    const topDef = document.createElement('div');
                    topDef.className = 'top-def-bar';
                    topDef.innerText = `Definition of ${targetWord}: ${advancedData.shortDef}`;
                    qContainer.insertBefore(topDef, qContainer.firstChild);
                }
            }

            let availableChoices = currentChoices.filter(c => c.dataset.tagged !== 'wrong');

            for (let i = 0; i < availableChoices.length; i++) {
                const choice = availableChoices[i];

                let cloneC = choice.cloneNode(true);
                let b = cloneC.querySelector('.def-match-badge');
                if (b) b.remove();

                const choiceText = cloneC.innerText.trim().toLowerCase();
                const cleanChoice = cleanQuestionText(choiceText);
                const choiceTokens = choiceText.split(/\W+/).filter(t => t.length > 2 && !stopWords.includes(t));

                let choiceArr = cleanChoice.split(/\s+/);
                let hasScrapedWord = false;
                if (choiceArr.length <= 2) {
                    hasScrapedWord = choiceArr.some(cw => {
                        if (stopWords.includes(cw) || cw.length < 3) return false;
                        let cwRoot = cw.length > 3 ? cw.replace(/(es|s|ed|ing)$/i, '') : cw;
                        return knownWordsList.some(kw => {
                            let kwRoot = kw.length > 3 ? kw.replace(/(es|s|ed|ing)$/i, '') : kw;
                            return kw === cw || kwRoot === cwRoot;
                        });
                    });
                }

                let isExact = (memExact === choiceText) || (memTarget === choiceText) || (memExact === cleanChoice) || (memTarget === cleanChoice);
                let score = 0;

                let exRatio = choiceTokens.length > 0 && advancedData.exampleTokens ? choiceTokens.filter(t => advancedData.exampleTokens.includes(t)).length / choiceTokens.length : 0;
                let defRatio = choiceTokens.length > 0 && advancedData.defTokens ? choiceTokens.filter(t => advancedData.defTokens.includes(t)).length / choiceTokens.length : 0;

                if (isExact) {
                    score = 9999;
                } else if (hasScrapedWord) {
                    score = 9500;
                } else if (isExampleQuestion && exRatio >= 0.75) {
                    score = 9400;
                } else if (isExampleQuestion && exRatio >= 0.50) {
                    score = 9350;
                } else if (isExampleQuestion && exRatio >= 0.25) {
                    score = 9300;
                } else if (isDefQuestion && defRatio >= 0.75) {
                    score = 9200;
                } else if (isDefQuestion && defRatio >= 0.50) {
                    score = 9150;
                } else if (isDefQuestion && defRatio >= 0.25) {
                    score = 9100;
                } else if (advancedData.words && (advancedData.words.includes(choiceText) || advancedData.words.includes(cleanChoice))) {
                    score = 9000;
                } else {
                    let partialOverlap = 0;
                    if (advancedData.defTokens) partialOverlap += choiceTokens.filter(t => advancedData.defTokens.includes(t)).length;
                    if (advancedData.exampleTokens) partialOverlap += choiceTokens.filter(t => advancedData.exampleTokens.includes(t)).length;

                    if (partialOverlap > 0) {
                        score = 8000 + partialOverlap;
                    }
                }

                if (score > maxScore) {
                    maxScore = score;
                    bestMatch = choice;
                }
            }

            if (bestMatch && !bestMatch.dataset.tagged) {
                const badge = document.createElement('div');
                let badgeText = '';
                let badgeClass = '';

                if (maxScore === 9999) {
                    badgeText = 'Answer from Cloud';
                    badgeClass = 'def-match-badge cloud-badge';
                } else if (maxScore === 9500) {
                    badgeText = 'Matches Scraped Word';
                    badgeClass = 'def-match-badge cloud-badge';
                } else if (maxScore === 9400) {
                    badgeText = '75% Library Example Match';
                    badgeClass = 'def-match-badge cloud-badge-orange';
                } else if (maxScore === 9350) {
                    badgeText = '50% Library Example Match';
                    badgeClass = 'def-match-badge cloud-badge-orange';
                } else if (maxScore === 9300) {
                    badgeText = '25% Library Example Match';
                    badgeClass = 'def-match-badge cloud-badge-orange';
                } else if (maxScore === 9200) {
                    badgeText = '75% Library Def Match';
                    badgeClass = 'def-match-badge cloud-badge-orange';
                } else if (maxScore === 9150) {
                    badgeText = '50% Library Def Match';
                    badgeClass = 'def-match-badge cloud-badge-orange';
                } else if (maxScore === 9100) {
                    badgeText = '25% Library Def Match';
                    badgeClass = 'def-match-badge cloud-badge-orange';
                } else if (maxScore >= 9000) {
                    badgeText = 'Advanced Library Match';
                    badgeClass = 'def-match-badge cloud-badge-orange';
                } else {
                    badgeText = 'Partial Match';
                    badgeClass = 'def-match-badge cloud-badge-orange';
                }

                qContainer.dataset.lastBadgeText = badgeText;
                qContainer.dataset.lastBadgeClass = badgeClass;

                badge.className = badgeClass;
                badge.style.display = 'block';
                badge.style.whiteSpace = 'normal';
                badge.style.textAlign = 'left';
                badge.style.marginTop = '8px';
                badge.style.marginLeft = '0';

                const textDiv = document.createElement('div');
                textDiv.innerText = badgeText;
                badge.appendChild(textDiv);

                bestMatch.appendChild(badge);
                bestMatch.dataset.tagged = 'true';

                if (autoClickEnabled) {
                    setTimeout(() => {
                        safeClick(bestMatch);
                        setTimeout(() => { triggerCanvasRightArrow(); }, 1500);
                    }, 1000);
                } else {
                    qContainer.classList.remove('dimmed-disabled');
                }
            } else if (!bestMatch && autoClickEnabled) {
                let nextChoice = availableChoices.find(c => c.dataset.pending !== 'true');
                if (nextChoice) {
                    nextChoice.dataset.pending = 'true';

                    const badge = document.createElement('div');
                    badge.className = qContainer.dataset.lastBadgeClass || 'def-match-badge cloud-badge-orange';
                    badge.style.display = 'block';
                    badge.style.whiteSpace = 'normal';
                    badge.style.textAlign = 'left';
                    badge.style.marginTop = '8px';
                    badge.style.marginLeft = '0';

                    const textDiv = document.createElement('div');
                    textDiv.innerText = qContainer.dataset.lastBadgeText || 'Partial Match';
                    badge.appendChild(textDiv);

                    nextChoice.appendChild(badge);

                    setTimeout(() => {
                        safeClick(nextChoice);
                        setTimeout(() => { triggerCanvasRightArrow(); }, 1500);
                    }, 1000);
                }
            } else {
                qContainer.classList.remove('dimmed-disabled');
            }
        }
    }

    function checkAutoScrape() {
        const urlMatch = window.location.href.match(/\/lists\/(\d+)/);
        if (urlMatch) {
            const currentListId = urlMatch[1];
            const storedListId = GM_getValue('vocabListId', '');

            if (currentListId !== storedListId) {
                GM_setValue('vocabMemory', '{}');
                GM_setValue('vocabListId', currentListId);
                scrapeListData(currentListId);
                syncCloud(currentListId);
            } else {
                syncCloud(currentListId);
            }
        }
    }

    function createUI() {
        const btn = document.createElement('button');
        btn.id = 'custom-settings-btn';
        btn.innerText = '⚙️';
        document.body.appendChild(btn);

        const panel = document.createElement('div');
        panel.id = 'custom-settings-panel';
        panel.innerHTML = `
            <h3 style="margin-top: 0; border-bottom: 1px solid #ccc; padding-bottom: 5px; cursor: grab; user-select: none;">Vocabulary Helper</h3>
            <p style="margin: 5px 0; font-size: 13px;">List ID: <span id="current-list-id-display" style="font-weight:bold;">None</span></p>
            <p style="margin: 5px 0; font-size: 13px;">Local Words: <span id="memory-status-count" style="font-weight:bold;">0</span></p>
            <p style="margin: 5px 0 15px 0; font-size: 13px; color: #0984e3;">Questions & Answers in Cloud: <span id="cloud-status-count" style="font-weight:bold;">0</span></p>

            <div class="toggle-container">
                <label for="auto-click-toggle" style="font-weight:bold; cursor:pointer;">Auto-Click Answers</label>
                <input type="checkbox" id="auto-click-toggle" style="cursor:pointer; width: 18px; height: 18px;">
            </div>

            <button id="scrape-list-btn" class="action-btn">Scrape Background List</button>

            <div id="spelling-helper-container">
                <h4 style="margin: 0 0 5px 0;">Spelling Helper</h4>
                <div id="spelling-word-list"></div>
            </div>
        `;
        document.body.appendChild(panel);

        btn.addEventListener('click', () => {
            panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none';
        });

        const toggle = document.getElementById('auto-click-toggle');
        toggle.checked = GM_getValue('autoClickEnabled', false);
        toggle.addEventListener('change', (e) => {
            GM_setValue('autoClickEnabled', e.target.checked);
        });

        document.getElementById('scrape-list-btn').addEventListener('click', () => {
            const urlMatch = window.location.href.match(/\/lists\/(\d+)/);
            if (urlMatch) scrapeListData(urlMatch[1]);
        });

        let isDragging = false, currentX, currentY, initialX = 0, initialY = 0, xOffset = 0, yOffset = 0;

        panel.querySelector('h3').addEventListener("mousedown", e => {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            isDragging = true;
        });

        document.addEventListener("mouseup", () => {
            isDragging = false;
        });

        document.addEventListener("mousemove", e => {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
                xOffset = currentX;
                yOffset = currentY;

                const dragPanel = document.getElementById('custom-settings-panel');
                if (dragPanel) {
                    dragPanel.style.transform = "translate3d(" + currentX + "px, " + currentY + "px, 0)";
                }
            }
        });

        updateMemoryUI();
    }

    window.addEventListener('DOMContentLoaded', () => {
        createUI();
        checkAutoScrape();

        let searchForms = document.querySelectorAll('form[action*="/dictionary/"]');
        searchForms.forEach(f => {
            f.addEventListener('submit', (e) => {
                if (document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.closest('form') === f) {
                    return true;
                }
                e.preventDefault();
                return false;
            });
        });

        document.addEventListener('input', (e) => {
            if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'text' && !e.target.id.includes('search')) {
                window.lastActiveInput = e.target;
                updateSpellingFilter(e.target.value);
            }
        });

        document.addEventListener('focusin', (e) => {
            if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'text' && !e.target.id.includes('search')) {
                window.lastActiveInput = e.target;
                updateSpellingFilter(e.target.value);
            }
        });

        let processTimer = null;
        const observer = new MutationObserver(() => {
            if (processTimer) clearTimeout(processTimer);
            processTimer = setTimeout(() => {
                processActiveQuestion();
            }, 300);
        });

        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-canvas-text', 'class'] });
    });

})();
