// @ts-nocheck
/**
 * إعدادات المشروع الأساسية والوظائف المشتركة.
 * تم تصميم هذا الملف ليكون مستعداً للتوسع (Scalable) بحيث يمكن فصل
 * التخزين المحلي (IndexedDB) عن الواجهة (UI) وربطها بـ API مستقبلاً.
 */
window.EthraApp = (function () {
  // ==========================================
  // الإعدادات والثوابت (Configuration)
  // ==========================================
  var CONFIG = {
    // إعدادات قاعدة البيانات المحلية
    DB_NAME: "ethra2",
    DB_VER: 2, // ترقية الإصدار لدعم التعليقات
    STORE: "clips",
    COMMENTS_STORE: "comments", // جدول التعليقات
    
    // إعدادات الذاكرة المحلية (LocalStorage)
    LS_SAVED: "ethra2_saved",
    LS_HISTORY: "ethra2_search_history",
    
    // إعدادات المنطق والأداء
    MAX_HISTORY: 14,
    CLIP_LIFETIME: 24 * 60 * 60 * 1000, // 24 ساعة بالميلي ثانية
    MAX_UPLOAD_SIZE: 150 * 1024 * 1024, // 150 ميجابايت كحد أقصى للرفع
    MAX_UPLOAD_FILES: 10,               // أقصى عدد ملفات في المرة الواحدة
    PAGE_SIZE: 5,                       // عدد المقاطع التي تظهر في كل مرة (Pagination)

    // مفتاح التبديل للسيرفر المستقبلي
    USE_REMOTE_API: false, // إذا أصبحت true، سيتم قراءة البيانات من السيرفر.
    CLOUDINARY_CLOUD_NAME: "dmpjtq50y",         // ضع اسم السحابة الخاص بك من Cloudinary
    CLOUDINARY_UPLOAD_PRESET: "ethra2_preset"  // ضع اسم الـ upload preset
  };

  // ==========================================
  // دوال مساعدة عامة (Utilities)
  // ==========================================
  
  // دالة لتأخير التنفيذ (مفيدة جداً في البحث الفوري لمنع الإرهاق)
  function debounce(func, wait) {
    var timeout;
    return function () {
      var context = this, args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(function () {
        func.apply(context, args);
      }, wait);
    };
  }

  function uuid() {
    var c = window.crypto || window.msCrypto;
    if (c && c.randomUUID) return c.randomUUID();
    return "c-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function formatCountdown(ms) {
    if (ms <= 0) return "00:00";
    var totalMin = Math.ceil(ms / 60000);
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }

  function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    var k = 1024,
        sizes = ["Bytes", "KB", "MB", "GB"],
        i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  function formatDate(timestamp) {
    var d = new Date(timestamp);
    var now = new Date();
    var diffMs = now - d;
    var diffMins = Math.floor(diffMs / 60000);
    var diffHours = Math.floor(diffMins / 60);
    var diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "الآن";
    if (diffMins < 60) return "منذ " + diffMins + " دقيقة";
    if (diffHours < 24) return "منذ " + diffHours + " ساعة";
    if (diffDays === 1) return "أمس";
    if (diffDays < 7) return "منذ " + diffDays + " أيام";
    
    return d.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
  }

  function revokeActiveUrls(urlsArray) {
    if (!urlsArray || !urlsArray.length) return;
    urlsArray.forEach(function (u) {
      try { URL.revokeObjectURL(u); } catch (e) {}
    });
    urlsArray.length = 0; // تفريغ المصفوفة
  }

  // ==========================================
  // إعدادات Firebase
  // ==========================================
  var firebaseConfig = {
    apiKey: "AIzaSyBj6qyGfUnbGr7DO3COLTmM54LoaDcrgw8",
    authDomain: "ethra2-ioi.firebaseapp.com",
    projectId: "ethra2-ioi",
    storageBucket: "ethra2-ioi.firebasestorage.app",
    messagingSenderId: "294241788590",
    appId: "1:294241788590:web:20601e8c824a578154433f",
    measurementId: "G-99P587YSMC"
  };

  // تهيئة Firebase
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  var auth = firebase.auth();
  var db = firebase.firestore();
  var storage = firebase.storage();

  // ==========================================
  // نظام المستخدمين (Auth Management)
  // ==========================================
  var Auth = {
    currentUser: null,
    onStateChange: function(callback) {
      auth.onAuthStateChanged(function(user) {
        Auth.currentUser = user;
        updateAuthUI(user);
        if (callback) callback(user);
      });
    },
    login: function() {
      var provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      return auth.signInWithPopup(provider).catch(function(error) {
        console.error("خطأ في تسجيل الدخول:", error);
        if (error.code === "auth/popup-blocked") {
          alert("تم حظر النافذة المنبثقة. يرجى السماح بالنوافذ المنبثقة لهذا الموقع.");
        } else if (error.code === "auth/unauthorized-domain") {
          alert("هذا النطاق غير مصرح به لتسجيل الدخول. يرجى إضافته في Firebase Console.");
        } else if (error.code !== "auth/popup-closed-by-user") {
          alert("حدث خطأ أثناء تسجيل الدخول: " + error.message);
        }
        throw error;
      });
    },
    logout: function() {
      return auth.signOut().catch(function(error) {
        console.error("خطأ في تسجيل الخروج:", error);
        alert("فشل في تسجيل الخروج.");
        throw error;
      });
    }
  };

  function updateAuthUI(user) {
    var loginBtn = document.getElementById("auth-login-btn");
    var userInfo = document.getElementById("auth-user-info");
    var userName = document.getElementById("auth-user-name");
    var uploadLabel = document.getElementById("upload-label");

    if (user) {
      if (loginBtn) loginBtn.hidden = true;
      if (userInfo) userInfo.hidden = false;
      if (userName) userName.textContent = user.displayName || user.email;
      if (uploadLabel) uploadLabel.hidden = false;
    } else {
      if (loginBtn) loginBtn.hidden = false;
      if (userInfo) userInfo.hidden = true;
      if (uploadLabel) uploadLabel.hidden = true;
    }
  }

  // تهيئة مستمعي الأحداث لـ Auth بمجرد تحميل الصفحة
  document.addEventListener("DOMContentLoaded", function() {
    var loginBtn = document.getElementById("auth-login-btn");
    var logoutBtn = document.getElementById("auth-logout-btn");

    if (loginBtn) {
      loginBtn.addEventListener("click", function() {
        Auth.login();
      });
    }
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function() {
        Auth.logout();
      });
    }
    
    // بدء الاستماع لحالة المستخدم
    Auth.onStateChange();
  });

  // ==========================================
  // محرك Firebase (Firebase Storage & Firestore Engine)
  // ==========================================
  var RemoteAPI = {
    getAll: function () {
      return db.collection("clips")
        .orderBy("createdAt", "desc")
        .get()
        .then(function(querySnapshot) {
          var clips = [];
          querySnapshot.forEach(function(doc) {
            clips.push(doc.data());
          });
          return clips;
        });
    },
    
    put: function (clip) {
      if (!Auth.currentUser) {
        return Promise.reject(new Error("يجب تسجيل الدخول لتتمكن من نشر مقاطع."));
      }
      console.log("بدء عملية الرفع لـ Cloudinary:", clip.name);
      var file = clip.blob;
      if (!file) {
        console.error("خطأ: لا يوجد ملف فيديو (blob) للرفع.");
        return Promise.reject(new Error("ملف الفيديو مفقود."));
      }

      var formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", CONFIG.CLOUDINARY_UPLOAD_PRESET);
      formData.append("folder", "ethra2_videos");

      return fetch(
        "https://api.cloudinary.com/v1_1/" + CONFIG.CLOUDINARY_CLOUD_NAME + "/video/upload",
        {
          method: "POST",
          body: formData
        }
      )
      .then(function(response) {
        if (!response.ok) {
          return response.json().then(function(err) { throw err; });
        }
        return response.json();
      })
      .then(function(data) {
        console.log("تم الرفع إلى Cloudinary بنجاح:", data.secure_url);
        var clipData = {
          id: clip.id,
          name: clip.name,
          fileName: clip.fileName,
          videoUrl: data.secure_url,
          createdAt: clip.createdAt || Date.now(),
          userId: Auth.currentUser ? Auth.currentUser.uid : "anonymous",
          authorName: Auth.currentUser ? (Auth.currentUser.displayName || "مستخدم") : "مستخدم",
          tags: clip.tags || []
        };
        return db.collection("clips").doc(clip.id).set(clipData);
      });
    },

    remove: function (docId) {
      return db.collection("clips").doc(docId).delete().then(function() {
        console.log("تم حذف المقطع بنجاح:", docId);
      });
    },

    getComments: function (clipId) {
      return db.collection("comments")
        .where("clipId", "==", clipId)
        .orderBy("createdAt", "desc")
        .get()
        .then(function(querySnapshot) {
          var comments = [];
          querySnapshot.forEach(function(doc) {
            comments.push(doc.data());
          });
          return comments;
        });
    },

    putComment: function (comment) {
      if (!Auth.currentUser) return Promise.reject(new Error("يجب تسجيل الدخول للتعليق"));
      
      comment.userId = Auth.currentUser.uid;
      comment.authorName = Auth.currentUser.displayName || "مستخدم";
      
      return db.collection("comments").doc(comment.id).set(comment);
    }
  };

  // ==========================================
  // طبقة التخزين المجردة (Storage Abstraction Layer)
  // ==========================================
  var Storage = {
    getClips: function () {
      return RemoteAPI.getAll();
    },
    saveClip: function (clip) {
      return RemoteAPI.put(clip);
    },
    removeClip: function (id) {
      return RemoteAPI.remove(id);
    },
    getComments: function (clipId) {
      return RemoteAPI.getComments(clipId);
    },
    saveComment: function (comment) {
      return RemoteAPI.putComment(comment);
    }
  };

  // ==========================================
  // إدارة المحفوظات (Saved Clips) في LocalStorage
  // ==========================================
  function getSavedIds() {
    try {
      var raw = localStorage.getItem(CONFIG.LS_SAVED);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function isSavedId(id) {
    var s = String(id);
    return getSavedIds().indexOf(s) !== -1;
  }

  function toggleSaved(id) {
    var s = String(id);
    var arr = getSavedIds();
    var idx = arr.indexOf(s);
    if (idx >= 0) {
      arr.splice(idx, 1);
    } else {
      arr.push(s);
    }
    localStorage.setItem(CONFIG.LS_SAVED, JSON.stringify(arr));
    return idx < 0; // return true if it was added
  }

  function removeSavedId(id) {
    var s = String(id);
    var arr = getSavedIds().filter(function (x) { return String(x) !== s; });
    localStorage.setItem(CONFIG.LS_SAVED, JSON.stringify(arr));
  }

  // ==========================================
  // تصدير واجهة برمجة التطبيق (API Export)
  // ==========================================
  return {
    Config: CONFIG,
    Auth: Auth,
    Storage: Storage,
    Saved: {
      getAll: getSavedIds,
      isSaved: isSavedId,
      toggle: toggleSaved,
      remove: removeSavedId
    },
    Utils: {
      debounce: debounce,
      uuid: uuid,
      formatCountdown: formatCountdown,
      formatBytes: formatBytes,
      formatDate: formatDate,
      revokeActiveUrls: revokeActiveUrls
    }
  };
})();