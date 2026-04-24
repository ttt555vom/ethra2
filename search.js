(function () {
  var App = window.EthraApp;
  if (!App) return;

  var form = document.getElementById("search-form");
  var input = document.getElementById("clip-query");
  var main = document.getElementById("search-results");
  var recentEl = document.getElementById("search-recent");
  if (!form || !input || !main) return;

  function normalize(s) {
    return (s || "").toString().trim().toLowerCase();
  }

  function loadHistory() {
    try {
      var raw = localStorage.getItem(App.Config.LS_HISTORY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveHistory(arr) {
    try {
      localStorage.setItem(App.Config.LS_HISTORY, JSON.stringify(arr));
    } catch (e) {}
  }

  function pushHistory(term) {
    var t = (term || "").trim();
    if (!t) return;
    var lower = normalize(t);
    var h = loadHistory().filter(function (x) {
      return normalize(x) !== lower;
    });
    h.unshift(t);
    if (h.length > App.Config.MAX_HISTORY) h = h.slice(0, App.Config.MAX_HISTORY);
    saveHistory(h);
  }

  function removeHistoryItem(term) {
    var lower = normalize(term);
    var h = loadHistory().filter(function (x) {
      return normalize(x) !== lower;
    });
    saveHistory(h);
  }

  function clearHistory() {
    saveHistory([]);
  }

  function renderRecent() {
    if (!recentEl) return;
    var items = loadHistory();
    if (!items.length) {
      recentEl.innerHTML = "";
      recentEl.hidden = true;
      return;
    }

    recentEl.hidden = false;
    recentEl.innerHTML = "";

    var head = document.createElement("div");
    head.className = "search-recent-head";

    var title = document.createElement("p");
    title.className = "search-recent-title";
    title.textContent = "آخر البحث";

    var clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "search-recent-clear";
    clearBtn.textContent = "مسح الكل";
    clearBtn.addEventListener("click", function () {
      clearHistory();
      renderRecent();
    });

    head.appendChild(title);
    head.appendChild(clearBtn);
    recentEl.appendChild(head);

    var ul = document.createElement("ul");
    ul.className = "search-recent-list";

    items.forEach(function (term) {
      var li = document.createElement("li");
      li.className = "search-recent-item";

      var termBtn = document.createElement("button");
      termBtn.type = "button";
      termBtn.className = "search-recent-term";
      termBtn.textContent = term;
      termBtn.addEventListener("click", function () {
        input.value = term;
        pushHistory(term);
        renderRecent();
        performSearch();
        input.focus();
      });

      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "search-recent-remove";
      rm.setAttribute("aria-label", "إزالة «" + term + "» من السجل");
      rm.textContent = "\u00D7";
      rm.addEventListener("click", function (ev) {
        ev.stopPropagation();
        removeHistoryItem(term);
        renderRecent();
      });

      li.appendChild(termBtn);
      li.appendChild(rm);
      ul.appendChild(li);
    });

    recentEl.appendChild(ul);
  }

  function filterClips(clips, q) {
    var nq = normalize(q);
    if (!nq) return [];
    
    // دعم البحث بكلمات متعددة
    var words = nq.split(/\s+/).filter(Boolean);
    if (!words.length) return [];

    return clips.filter(function (c) {
      var name = normalize(c.name || "");
      var fn = normalize(c.fileName || "");
      var tags = (c.tags || []).map(normalize).join(" ");
      var searchableText = name + " " + fn + " " + tags;
      
      // يجب أن تتطابق جميع الكلمات (AND search)
      return words.every(function (word) {
        return searchableText.indexOf(word) >= 0;
      });
    });
  }

  function renderHint() {
    main.innerHTML = "";
    var p = document.createElement("p");
    p.className = "search-hint";
    p.textContent = "اكتب اسماً ثم اضغط «بحث» لعرض المطابقات.";
    main.appendChild(p);
  }

  function renderEmpty() {
    main.innerHTML = "";
    var p = document.createElement("p");
    p.className = "search-empty";
    p.textContent = "لا توجد مقاطع مخزّنة بعد. انشر مقطعاً من الشاشة الرئيسية.";
    main.appendChild(p);
  }

  function renderNoResults() {
    main.innerHTML = "";
    var p = document.createElement("p");
    p.className = "search-no-results";
    p.textContent = "لا توجد نتائج مطابقة لاسم البحث.";
    main.appendChild(p);
  }

  function renderResults(matches) {
    main.innerHTML = "";
    var ul = document.createElement("ul");
    ul.className = "search-list";
    matches.forEach(function (clip) {
      var li = document.createElement("li");
      li.className = "search-item";

      var span = document.createElement("span");
      span.className = "search-item-name";
      span.textContent = clip.name || clip.fileName || "مقطع";

      var a = document.createElement("a");
      a.className = "search-item-open";
      a.href = "index.html#clip=" + encodeURIComponent(clip.id);
      a.textContent = "فتح";

      li.appendChild(span);
      li.appendChild(a);
      ul.appendChild(li);
    });
    main.appendChild(ul);
  }

  var performSearch = function () {
    var q = input.value;
    App.Storage.getClips()
      .then(function (clips) {
        if (!clips.length) {
          renderEmpty();
          return;
        }
        var matches = filterClips(clips, q);
        if (!normalize(q)) {
          renderHint();
          return;
        }
        if (!matches.length) {
          renderNoResults();
          return;
        }
        renderResults(matches);
      })
      .catch(function (err) {
        console.error(err);
        main.innerHTML =
          '<p class="search-empty">تعذّر البحث. تحقق من المتصفح أو حاول لاحقاً.</p>';
      });
  };

  // نظام البحث الفوري الذكي أثناء الكتابة (Live Search with Debounce)
  var liveSearch = App.Utils.debounce(function () {
    performSearch();
  }, 300);

  input.addEventListener("input", function () {
    var q = input.value.trim();
    if (q) {
      liveSearch();
    } else {
      renderHint();
    }
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (q) pushHistory(q);
    renderRecent();
    performSearch();
  });

  renderRecent();

  var params = new URLSearchParams(window.location.search);
  var initialQ = params.get("q");
  if (initialQ) {
    input.value = initialQ;
    performSearch();
  } else {
    renderHint();
  }
})();
