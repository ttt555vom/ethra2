(function () {
  var App = window.EthraApp;
  if (!App) {
    console.error("إعدادات التطبيق مفقودة. تأكد من تضمين config.js");
    return;
  }

  var feedEl = document.getElementById("feed");
  if (!feedEl) return;

  var playbackIo = null;
  var playbackIo = null;
  var scrollHandler = null;
  var globalMuted = true;
  var refreshing = false;

  // Pagination (Infinite Scroll) variables
  var allClips = [];
  var loadedClipsCount = 0;
  var infiniteScrollIo = null;

  function detachFeedSnap(feed) {
    var s = feed._ethraSnap;
    if (!s) return;
    if (s.snap && s.snap.timer) clearTimeout(s.snap.timer);
    window.removeEventListener("resize", s.onResize);
    feed.removeEventListener("scroll", s.onScroll);
    feed.removeEventListener("touchend", s.onTouchEnd);
    feed.removeEventListener("touchcancel", s.onTouchEnd);
    feed._ethraSnap = null;
  }

  function syncReelHeights(feed) {
    var h = feed.clientHeight;
    if (!h) return;
    var reels = feed.querySelectorAll(".reel");
    Array.prototype.forEach.call(reels, function (el) {
      el.style.height = h + "px";
      el.style.minHeight = h + "px";
    });
  }

  function finalizeSnapScroll(feed) {
    var reels = feed.querySelectorAll(".reel");
    var n = reels.length;
    if (!n) return;
    var h = feed.clientHeight;
    if (!h) return;
    var st = feed.scrollTop;
    var maxIdx = n - 1;
    var i = Math.floor(st / h + 1e-6);
    if (i > maxIdx) i = maxIdx;
    var frac = (st - i * h) / h;
    if (frac < 0) frac = 0;
    var edge = 0.12;
    var target;
    if (frac < edge) {
      target = i;
    } else if (frac > 1 - edge) {
      target = Math.min(i + 1, maxIdx);
    } else {
      target = Math.max(0, Math.min(maxIdx, Math.round(st / h)));
    }
    var dest = Math.round(target * h);
    if (Math.abs(st - dest) < 2) return;
    feed.scrollTo({ top: dest, behavior: "smooth" });
  }

  function attachFeedSnap(feed) {
    detachFeedSnap(feed);

    var snap = { timer: null };

    function scheduleFinalize(delay) {
      if (snap.timer) clearTimeout(snap.timer);
      snap.timer = setTimeout(function () {
        snap.timer = null;
        finalizeSnapScroll(feed);
      }, delay);
    }

    function onResize() {
      syncReelHeights(feed);
      finalizeSnapScroll(feed);
    }

    function onScroll() {
      scheduleFinalize(100);
    }

    function onTouchEnd() {
      scheduleFinalize(45);
    }

    syncReelHeights(feed);
    window.addEventListener("resize", onResize);
    feed.addEventListener("scroll", onScroll, { passive: true });
    feed.addEventListener("touchend", onTouchEnd, { passive: true });
    feed.addEventListener("touchcancel", onTouchEnd, { passive: true });

    feed._ethraSnap = {
      snap: snap,
      onResize: onResize,
      onScroll: onScroll,
      onTouchEnd: onTouchEnd,
    };
  }

  var countdownTimer = null;

  function buildReel(clip, index, src) {
    var section = document.createElement("section");
    section.className = "reel";
    section.setAttribute("data-index", String(index));
    section.setAttribute("data-id", clip.id);

    var video = document.createElement("video");
    video.src = src;
    video.setAttribute("playsinline", "");
    video.setAttribute("loop", "");
    video.muted = globalMuted;
    video.setAttribute("preload", "none"); // لتحسين الأداء والذاكرة
    video._userPaused = false;

    var grad = document.createElement("div");
    grad.className = "reel-gradient";

    var cap = document.createElement("div");
    cap.className = "reel-caption";
    var user = document.createElement("div");
    user.className = "reel-user";
    user.textContent = clip.name || "مقطع";
    var txt = document.createElement("p");
    txt.className = "reel-text";
    txt.textContent = "اضغط للإيقاف والتشغيل، أو مرتين لكتم الصوت";

    cap.appendChild(user);
    cap.appendChild(txt);

    var side = document.createElement("div");
    side.className = "reel-side";

    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "reel-action reel-save";
    var isSaved = App.Saved.isSaved(clip.id);
    saveBtn.setAttribute("aria-pressed", isSaved ? "true" : "false");
    if (isSaved) saveBtn.classList.add("is-saved");

    var saveIcon = document.createElement("span");
    saveIcon.className = "icon";
    saveIcon.setAttribute("aria-hidden", "true");
    saveIcon.textContent = "\uD83D\uDD16";
    var saveLabel = document.createElement("span");
    saveLabel.className = "reel-save-label";
    saveLabel.textContent = isSaved ? "محفوظ" : "حفظ";

    saveBtn.appendChild(saveIcon);
    saveBtn.appendChild(saveLabel);

    saveBtn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var on = App.Saved.toggle(clip.id);
      saveBtn.setAttribute("aria-pressed", on ? "true" : "false");
      saveBtn.classList.toggle("is-saved", on);
      saveLabel.textContent = on ? "محفوظ" : "حفظ";
    });

    var commentsBtn = document.createElement("button");
    commentsBtn.type = "button";
    commentsBtn.className = "reel-action reel-comments";
    var commentsIcon = document.createElement("span");
    commentsIcon.className = "icon";
    commentsIcon.setAttribute("aria-hidden", "true");
    commentsIcon.textContent = "\uD83D\uDCAC";
    var commentsLabel = document.createElement("span");
    commentsLabel.className = "reel-save-label";
    commentsLabel.textContent = "التعليقات";
    
    commentsBtn.appendChild(commentsIcon);
    commentsBtn.appendChild(commentsLabel);
    
    commentsBtn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      openCommentsModal(clip.id);
    });

    side.appendChild(commentsBtn);
    side.appendChild(saveBtn);

    var countdown = document.createElement("div");
    countdown.className = "reel-countdown";
    var remaining = App.Config.CLIP_LIFETIME - (Date.now() - (clip.createdAt || Date.now()));
    countdown.textContent = App.Utils.formatCountdown(remaining);
    countdown.setAttribute("data-created", String(clip.createdAt || Date.now()));
    side.appendChild(countdown);

    var hint = document.createElement("div");
    hint.className = "reel-mute-hint";
    hint.setAttribute("aria-live", "polite");

    section.appendChild(video);
    section.appendChild(grad);
    section.appendChild(cap);
    section.appendChild(side);
    section.appendChild(hint);

    return section;
  }

  function setAllVideosMute(muted) {
    globalMuted = muted;
    var allVideos = feedEl.querySelectorAll(".reel video");
    Array.prototype.forEach.call(allVideos, function (v) {
      v.muted = muted;
    });
  }

  function bindVideoEvents(video, hint) {
    var clickTimer = null;
    var lastClickTime = 0;
    var hintTimer = null;

    function showHint(text, duration) {
      if (hintTimer) clearTimeout(hintTimer);
      hint.textContent = text;
      hint.classList.add("visible");
      hintTimer = setTimeout(function () {
        hint.classList.remove("visible");
        hintTimer = null;
      }, duration);
    }

    video.addEventListener("click", function () {
      var now = Date.now();
      var timeDiff = now - lastClickTime;

      if (timeDiff < 350) {
        clearTimeout(clickTimer);
        clickTimer = null;
        lastClickTime = 0;
        setAllVideosMute(!globalMuted);
        if (!globalMuted) {
          showHint("🔊 الصوت مفعّل", 1200);
        } else {
          showHint("🔇 الصوت مكتوم", 1200);
        }
      } else {
        lastClickTime = now;
        clickTimer = setTimeout(function () {
          clickTimer = null;
          if (video.paused) {
            video._userPaused = false;
            video.play().catch(function () {});
            showHint("▶ تشغيل", 800);
          } else {
            video._userPaused = true;
            video.pause();
            showHint("⏸ إيقاف", 800);
          }
        }, 350);
      }
    });
  }

  function setupPlayback(feed) {
    detachFeedSnap(feed);

    var reels = Array.prototype.slice.call(feed.querySelectorAll(".reel"));
    if (reels.length === 0) return;

    if (playbackIo) {
      playbackIo.disconnect();
      playbackIo = null;
    }
    if (scrollHandler) {
      feed.removeEventListener("scroll", scrollHandler);
      scrollHandler = null;
    }

    function setActive(index) {
      var nodes = feed.querySelectorAll(".reel");
      Array.prototype.forEach.call(nodes, function (reel, i) {
        var v = reel.querySelector("video");
        if (!v) return;
        
        var distance = Math.abs(i - index);
        if (distance > 2) {
            v.setAttribute("preload", "none");
        } else {
            v.setAttribute("preload", "metadata");
        }

        if (i === index) {
          if (!v._userPaused) {
            v.play().catch(function () {});
          }
        } else {
          v._userPaused = false;
          v.pause();
          v.currentTime = 0;
        }
      });
    }

    function nearestIndex() {
      var h = feed.clientHeight;
      if (!h) return 0;
      var top = feed.scrollTop;
      return Math.round(top / h);
    }

    playbackIo = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting || e.intersectionRatio < 0.55) return;
          var reel = e.target.closest(".reel");
          if (!reel) return;
          var idx = parseInt(reel.getAttribute("data-index"), 10);
          if (!isNaN(idx)) setActive(idx);
        });
      },
      { root: feed, threshold: [0.55, 0.75] }
    );

    reels.forEach(function (r) {
      playbackIo.observe(r);
      var v = r.querySelector("video");
      var hint = r.querySelector(".reel-mute-hint");
      if (v && hint) bindVideoEvents(v, hint);
    });

    scrollHandler = function () {
      var n = feed.querySelectorAll(".reel").length;
      if (!n) return;
      var idx = nearestIndex();
      setActive(Math.max(0, Math.min(idx, n - 1)));
    };
    feed.addEventListener("scroll", scrollHandler, { passive: true });

    setActive(nearestIndex());
    attachFeedSnap(feed);
  }

  // --- نظام التمرير اللانهائي (Infinite Scroll) ---
  function observeLastReel() {
    var reels = feedEl.querySelectorAll('.reel');
    if (!reels.length) return;
    var lastReel = reels[reels.length - 1];

    if (infiniteScrollIo) {
      infiniteScrollIo.disconnect();
    }

    infiniteScrollIo = new IntersectionObserver(function(entries) {
      if (entries[0].isIntersecting) {
        renderNextPage();
      }
    }, { root: feedEl, rootMargin: "0px 0px 800px 0px" });

    infiniteScrollIo.observe(lastReel);
  }

  function renderNextPage() {
    if (loadedClipsCount >= allClips.length) return;

    var nextBatch = allClips.slice(loadedClipsCount, loadedClipsCount + App.Config.PAGE_SIZE);
    
    nextBatch.forEach(function (clip) {
      if (clip.videoUrl) {
        feedEl.appendChild(buildReel(clip, loadedClipsCount, clip.videoUrl));
      }
      loadedClipsCount++;
    });

    setupPlayback(feedEl);
    requestAnimationFrame(function () {
      syncReelHeights(feedEl);
      if (loadedClipsCount === nextBatch.length) {
        scrollToClipFromHash(feedEl);
      }
    });

    observeLastReel();
  }

  function scrollToClipFromHash(feed) {
    var hash = location.hash || "";
    var m = /[#&]clip=([^&]+)/.exec(hash);
    if (!m) return;
    var id = decodeURIComponent(m[1]);
    var reels = feed.querySelectorAll(".reel");
    var idx = -1;
    Array.prototype.forEach.call(reels, function (r, i) {
      if (r.getAttribute("data-id") === id) idx = i;
    });
    if (idx < 0) return;
    var h = feed.clientHeight;
    if (!h) return;
    feed.scrollTop = Math.round(idx * h);
    Array.prototype.forEach.call(reels, function (reel, i) {
      var v = reel.querySelector("video");
      if (!v) return;
      if (i === idx) {
        v.play().catch(function () {});
      } else {
        v.pause();
        v.currentTime = 0;
      }
    });
  }

  function deleteExpiredClips(clips) {
    var now = Date.now();
    var expired = clips.filter(function (c) {
      return now - (c.createdAt || 0) >= App.Config.CLIP_LIFETIME;
    });
    var chain = Promise.resolve();
    expired.forEach(function (c) {
      chain = chain.then(function () {
        return App.Storage.removeClip(c.id);
      });
    });
    return chain.then(function () {
      return clips.filter(function (c) {
        return now - (c.createdAt || 0) < App.Config.CLIP_LIFETIME;
      });
    });
  }

  function startCountdownUpdater() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(function () {
      var els = feedEl.querySelectorAll(".reel-countdown");
      if (!els.length) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        return;
      }
      var needsRefresh = false;
      Array.prototype.forEach.call(els, function (el) {
        var created = parseInt(el.getAttribute("data-created"), 10);
        if (isNaN(created)) return;
        var remaining = App.Config.CLIP_LIFETIME - (Date.now() - created);
        if (remaining <= 0) {
          el.textContent = "00:00";
          needsRefresh = true;
        } else {
          el.textContent = App.Utils.formatCountdown(remaining);
        }
      });
      if (needsRefresh) refresh();
    }, 1000);
  }

  function refresh() {
    if (refreshing) return;
    refreshing = true;
    
    // إعادة تعيين حالة التمرير
    loadedClipsCount = 0;
    allClips = [];
    if (infiniteScrollIo) {
      infiniteScrollIo.disconnect();
    }

    App.Storage.getClips()
      .then(function (clips) {
        return deleteExpiredClips(clips);
      })
      .then(function (clips) {
        allClips = clips;
        allClips.sort(function (a, b) {
          return (b.createdAt || 0) - (a.createdAt || 0);
        });

        var errBanner = document.getElementById("feed-load-err");
        if (errBanner) errBanner.remove();

        Array.prototype.forEach.call(feedEl.querySelectorAll(".reel"), function (n) {
          n.remove();
        });

        if (allClips.length > 0) {
          renderNextPage();
        }
        startCountdownUpdater();
      })
      .catch(function (err) {
        console.error(err);
        var feedMsg = document.getElementById("feed-load-err");
        if (!feedMsg) {
          feedMsg = document.createElement("p");
          feedMsg.id = "feed-load-err";
          feedMsg.className = "feed-load-err";
          feedMsg.setAttribute("role", "alert");
          feedEl.insertBefore(feedMsg, feedEl.firstChild);
        }
        feedMsg.textContent =
          (err && err.message) ||
          "تعذّر تحميل المقاطع. تأكد من فتح الصفحة عبر http://localhost أو المتصفح مباشرة.";
      })
      .finally(function () {
        refreshing = false;
      });
  }

  function defaultNameFromFile(file) {
    return file.name.replace(/\.[^/.]+$/, "") || "مقطع";
  }

  var uploadInput = document.getElementById("clip-upload");
  var uploadPanel = document.getElementById("upload-panel");
  var uploadNamesList = document.getElementById("upload-names-list");
  var uploadCancel = document.getElementById("upload-cancel");
  var uploadConfirm = document.getElementById("upload-confirm");
  var pendingUploadFiles = [];

  var uploadFeedback = document.getElementById("upload-feedback");

  function setUploadFeedback(msg, ok) {
    if (!uploadFeedback) return;
    uploadFeedback.textContent = msg || "";
    uploadFeedback.classList.toggle("is-ok", !!ok);
  }

  function closeUploadPanel() {
    if (!uploadPanel) return;
    uploadPanel.hidden = true;
    uploadPanel.setAttribute("aria-hidden", "true");
    if (uploadNamesList) uploadNamesList.innerHTML = "";
    pendingUploadFiles = [];
    if (uploadInput) uploadInput.value = "";
    setUploadFeedback("");
    if (uploadConfirm) {
      uploadConfirm.disabled = false;
      uploadConfirm.textContent = "نشر المقطع";
    }
  }

  function openUploadPanel(files) {
    if (!uploadPanel || !uploadNamesList) return;
    
    // التحقق من صحة الملفات (Validation)
    var validFiles = [];
    var errors = [];
    
    if (files.length > App.Config.MAX_UPLOAD_FILES) {
      errors.push("أقصى عدد مسموح به هو " + App.Config.MAX_UPLOAD_FILES + " ملفات.");
      files = Array.prototype.slice.call(files, 0, App.Config.MAX_UPLOAD_FILES);
    }

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      // السماح لـ API المستقبلي بتحميل ملفات بدون قيود صارمة إذا تطلب الأمر
      if (file.type && !file.type.startsWith("video/")) {
        errors.push("الملف '" + file.name + "' ليس فيديو صالحاً.");
        continue;
      }
      if (file.size > App.Config.MAX_UPLOAD_SIZE) {
        errors.push("الملف '" + file.name + "' كبير جداً (" + App.Utils.formatBytes(file.size) + "). الأقصى هو " + App.Utils.formatBytes(App.Config.MAX_UPLOAD_SIZE) + ".");
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      alert("لم يتم العثور على ملفات صالحة للرفع.\n\n" + errors.join("\n"));
      if (uploadInput) uploadInput.value = "";
      return;
    }

    if (errors.length > 0) {
      alert("بعض الملفات لم تكن صالحة وسيتم تخطيها:\n\n" + errors.join("\n"));
    }

    pendingUploadFiles = validFiles;
    uploadNamesList.innerHTML = "";
    pendingUploadFiles.forEach(function (file, i) {
      var row = document.createElement("div");
      row.className = "upload-name-row";
      var lab = document.createElement("label");
      lab.className = "upload-name-label";
      lab.textContent = "مقطع " + (i + 1) + " (" + App.Utils.formatBytes(file.size) + ")";
      lab.setAttribute("for", "upload-name-" + i);
      var inp = document.createElement("input");
      inp.type = "text";
      inp.id = "upload-name-" + i;
      inp.className = "upload-name-input";
      inp.value = defaultNameFromFile(file);
      inp.setAttribute("aria-label", "اسم المقطع " + (i + 1));
      row.appendChild(lab);
      row.appendChild(inp);
      uploadNamesList.appendChild(row);
    });
    uploadPanel.hidden = false;
    uploadPanel.setAttribute("aria-hidden", "false");
    setUploadFeedback("");
  }

  if (uploadInput && uploadPanel && uploadNamesList) {
    uploadInput.addEventListener("change", function () {
      var files = uploadInput.files;
      if (!files || !files.length) return;
      openUploadPanel(files);
    });
  }

  if (uploadCancel) {
    uploadCancel.addEventListener("click", function () {
      closeUploadPanel();
    });
  }

  if (uploadConfirm) {
    uploadConfirm.addEventListener("click", function () {
      var namesEl = document.getElementById("upload-names-list");
      if (!pendingUploadFiles.length) {
        closeUploadPanel();
        return;
      }
      if (!namesEl) {
        setUploadFeedback("خطأ في واجهة النشر. حدّث الصفحة.");
        return;
      }
      var inputs = namesEl.querySelectorAll(".upload-name-input");
      uploadConfirm.disabled = true;
      setUploadFeedback("جاري النشر…");
      
      var chain = Promise.resolve();
      pendingUploadFiles.forEach(function (file, i) {
        chain = chain.then(function () {
          var inp = inputs[i];
          var name = inp && inp.value.trim();
          if (!name) name = defaultNameFromFile(file);
          var clip = {
            id: App.Utils.uuid(),
            name: name,
            fileName: file.name,
            createdAt: Date.now(),
            blob: file, // هذا الحقل للرفع فقط ثم يتم حذفه أو تجاهله في Firestore
          };
          return App.Storage.saveClip(clip);
        });
      });

      chain.then(function () {
        closeUploadPanel();
        refresh();
      }).catch(function (err) {
        console.error(err);
        var msg = (err && err.message) || "تعذّر حفظ المقطع. تأكد من عمل بيئة التخزين.";
        setUploadFeedback(msg, false);
        uploadConfirm.disabled = false;
      });
    });
  }

  // ==========================================
  // منطق نافذة التعليقات (Comments Modal Logic)
  // ==========================================
  var currentClipIdForComments = null;
  var commentsModal = document.getElementById("comments-modal");
  var commentsModalOverlay = document.getElementById("comments-modal-overlay");
  var commentsModalClose = document.getElementById("comments-modal-close");
  var commentsListEl = document.getElementById("comments-list");
  var commentsForm = document.getElementById("comments-form");
  var commentInput = document.getElementById("comment-input");
  var commentSubmit = document.getElementById("comment-submit");
  var commentsCountEl = document.getElementById("comments-count");
  var dragHandle = document.getElementById("comments-modal-drag-handle");
  var modalContent = document.getElementById("comments-modal-content");

  if (commentInput && commentSubmit) {
    commentInput.addEventListener("input", function() {
      commentSubmit.disabled = !commentInput.value.trim();
    });
  }

  // دعم السحب للأسفل للإغلاق (Drag to close)
  var touchStartY = 0;
  var currentY = 0;
  var isDragging = false;

  if (dragHandle && modalContent) {
    dragHandle.addEventListener("touchstart", function(e) {
      touchStartY = e.touches[0].clientY;
      currentY = touchStartY;
      isDragging = true;
      modalContent.style.transition = "none";
    }, {passive: true});

    dragHandle.addEventListener("touchmove", function(e) {
      if (!isDragging) return;
      currentY = e.touches[0].clientY;
      var diff = currentY - touchStartY;
      if (diff > 0) {
        modalContent.style.transform = "translateY(" + diff + "px)";
      }
    }, {passive: true});

    dragHandle.addEventListener("touchend", function(e) {
      if (!isDragging) return;
      isDragging = false;
      modalContent.style.transition = "transform 0.3s cubic-bezier(0.1, 0.8, 0.1, 1)";
      var diff = currentY - touchStartY;
      if (diff > 120) {
        closeCommentsModal();
        setTimeout(function() {
          modalContent.style.transform = "";
        }, 300);
      } else {
        modalContent.style.transform = "translateY(0)";
      }
      touchStartY = 0;
      currentY = 0;
    });
  }

  function openCommentsModal(clipId) {
    if (!commentsModal) return;
    currentClipIdForComments = clipId;
    commentsModal.hidden = false;
    
    // للسماح للمتصفح برسم العنصر قبل تفعيل الـ Transition
    requestAnimationFrame(function() {
      commentsModal.setAttribute("aria-hidden", "false");
    });
    
    renderCommentsList();
  }

  function closeCommentsModal() {
    if (!commentsModal) return;
    currentClipIdForComments = null;
    commentsModal.setAttribute("aria-hidden", "true");
    
    setTimeout(function() {
      commentsModal.hidden = true;
    }, 300);
  }

  if (commentsModalClose) commentsModalClose.addEventListener("click", closeCommentsModal);
  if (commentsModalOverlay) commentsModalOverlay.addEventListener("click", closeCommentsModal);

  function renderCommentsList() {
    if (!currentClipIdForComments || !commentsListEl) return;
    
    commentsListEl.innerHTML = `
      <div class="comments-loading">
        <div class="spinner"></div>
        <p>جاري تحميل التعليقات...</p>
      </div>
    `;
    
    App.Storage.getComments(currentClipIdForComments).then(function(comments) {
      if (commentsCountEl) commentsCountEl.textContent = comments.length.toString();
      
      if (!comments.length) {
        commentsListEl.innerHTML = `
          <div class="comments-empty-container">
            <div class="comments-empty-icon">💬</div>
            <p class="comments-empty-text">لا توجد تعليقات بعد. كن أول من يعلق!</p>
          </div>
        `;
        return;
      }
      
      commentsListEl.innerHTML = "";
      
      // الترتيب من الأحدث للأقدم
      comments.sort(function(a, b) {
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
      
      comments.forEach(function(comment) {
        var item = document.createElement("div");
        item.className = "comment-item";
        
        var header = document.createElement("div");
        header.className = "comment-header";
        
        var author = document.createElement("span");
        author.className = "comment-author";
        author.textContent = comment.authorName || "مستخدم";
        
        var date = document.createElement("span");
        date.className = "comment-date";
        date.textContent = App.Utils.formatDate(comment.createdAt);
        
        header.appendChild(author);
        header.appendChild(date);
        
        var text = document.createElement("p");
        text.className = "comment-text";
        text.textContent = comment.text;
        
        item.appendChild(header);
        item.appendChild(text);
        
        commentsListEl.appendChild(item);
      });
    }).catch(function(err) {
      console.error("خطأ في جلب التعليقات:", err);
      commentsListEl.innerHTML = "<p class='comments-error'>حدث خطأ أثناء تحميل التعليقات. يرجى المحاولة لاحقاً.</p>";
    });
  }

  if (commentsForm) {
    commentsForm.addEventListener("submit", function(e) {
      e.preventDefault();
      
      // التحقق من تسجيل الدخول أولاً
      if (!App.Auth.currentUser) {
        alert("يرجى تسجيل الدخول لتتمكن من إضافة تعليق.");
        App.Auth.login();
        return;
      }

      if (!currentClipIdForComments || !commentInput) return;
      
      var text = commentInput.value.trim();
      if (!text) return;
      
      var comment = {
        id: App.Utils.uuid(),
        clipId: currentClipIdForComments,
        text: text,
        createdAt: Date.now()
      };
      
      commentInput.disabled = true;
      if (commentSubmit) commentSubmit.disabled = true;
      
      App.Storage.saveComment(comment).then(function() {
        commentInput.value = "";
        commentInput.disabled = false;
        commentInput.focus();
        renderCommentsList();
      }).catch(function(err) {
        console.error(err);
        alert("فشل في إرسال التعليق: " + (err.message || "خطأ غير معروف"));
        commentInput.disabled = false;
        if (commentSubmit) commentSubmit.disabled = false;
      });
    });
  }

  window.addEventListener("hashchange", function () {
    scrollToClipFromHash(feedEl);
  });

  refresh();
})();
