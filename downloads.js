(function () {
  var App = window.EthraApp;
  if (!App) return;

  var main = document.querySelector(".downloads-main");
  if (!main) return;

  // activeObjectUrls are no longer needed for Firebase URLs

  function showActionError(msg) {
    var p = document.createElement("p");
    p.className = "downloads-action-error";
    p.setAttribute("role", "alert");
    p.textContent = msg;
    main.insertBefore(p, main.firstChild);
    setTimeout(function () {
      try {
        p.remove();
      } catch (e) {}
    }, 8000);
  }

  function render() {
    App.Storage.getClips()
      .then(function (clips) {
        main.innerHTML = "";

        clips.sort(function (a, b) {
          return (b.createdAt || 0) - (a.createdAt || 0);
        });

        if (clips.length === 0) {
          var p = document.createElement("p");
          p.className = "downloads-empty";
          p.textContent = "لا توجد مقاطع بعد.";
          main.appendChild(p);
          return;
        }

        var intro = document.createElement("p");
        intro.className = "downloads-intro";
        intro.textContent =
          "المقاطع التالية منشورة في الرئيسية. للحذف: اضغط «حذف» ثم اضغط «تأكيد الحذف».";
        main.appendChild(intro);

        var list = document.createElement("ul");
        list.className = "downloads-list";

        clips.forEach(function (clip) {
          var clipId = String(clip.id);

          var li = document.createElement("li");
          li.className = "downloads-item";

          var top = document.createElement("div");
          top.className = "downloads-item-top";

          var nameEl = document.createElement("div");
          nameEl.className = "downloads-name";
          nameEl.textContent = clip.name || "مقطع";

          top.appendChild(nameEl);

          if (App.Saved.isSaved(clipId)) {
            var badge = document.createElement("span");
            badge.className = "downloads-saved-badge";
            badge.textContent = "محفوظ";
            top.appendChild(badge);
          }

          var bottom = document.createElement("div");
          bottom.className = "downloads-item-bottom";

          var a = document.createElement("a");
          a.className = "downloads-link";
          if (clip.videoUrl) {
            a.href = clip.videoUrl;
            a.target = "_blank"; // Open in new tab if needed
          } else {
            a.href = "#";
          }
          a.download = clip.fileName || (clip.name || "clip") + ".mp4";
          a.textContent = "تنزيل";

          a.addEventListener("click", function (ev) {
            if (!clip.videoUrl) {
              ev.preventDefault();
              showActionError("بيانات المقطع تالفة ولا يمكن تنزيله.");
            }
          });

          var delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "downloads-delete";
          delBtn.textContent = "حذف من الرئيسية";
          delBtn.setAttribute(
            "aria-label",
            "حذف المقطع «" + (clip.name || "مقطع") + "» من الجهاز والرئيسية",
          );

          delBtn.addEventListener("click", function () {
            if (!delBtn.dataset.step) {
              delBtn.dataset.step = "1";
              delBtn.textContent = "تأكيد الحذف";
              delBtn.classList.add("downloads-delete--pending");
              if (delBtn._t) clearTimeout(delBtn._t);
              delBtn._t = setTimeout(function () {
                if (delBtn.dataset.step === "1") {
                  delete delBtn.dataset.step;
                  delBtn.textContent = "حذف من الرئيسية";
                  delBtn.classList.remove("downloads-delete--pending");
                }
              }, 6000);
              return;
            }
            delete delBtn.dataset.step;
            if (delBtn._t) clearTimeout(delBtn._t);
            delBtn.classList.remove("downloads-delete--pending");
            delBtn.disabled = true;
            delBtn.textContent = "جاري الحذف…";

            App.Storage.removeClip(clipId)
              .then(function () {
                App.Saved.remove(clipId);
                render();
              })
              .catch(function (err) {
                console.error(err);
                delBtn.disabled = false;
                delBtn.textContent = "حذف من الرئيسية";
                showActionError(
                  (err && err.message) ||
                    "تعذّر الحذف. جرّب فتح الموقع عبر متصفح عادي أو localhost.",
                );
              });
          });

          bottom.appendChild(delBtn);
          bottom.appendChild(a);

          li.appendChild(top);
          li.appendChild(bottom);
          list.appendChild(li);
        });

        main.appendChild(list);
      })
      .catch(function (err) {
        console.error(err);
        main.innerHTML = "";
        var errP = document.createElement("p");
        errP.className = "downloads-empty";
        errP.setAttribute("role", "alert");
        errP.textContent =
          (err && err.message) ||
          "تعذّر تحميل القائمة. افتح الصفحة في المتصفح أو عبر خادم محلي.";
        main.appendChild(errP);
      });
  }

  render();
})();
