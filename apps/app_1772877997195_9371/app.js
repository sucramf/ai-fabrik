(function() {
  const spec = window.__SPEC__ || {};
  const type = (spec.product_type || "micro_saas").toLowerCase();
  const storageKey = "ai_fabrik_Word_count_calculato";

  function getOutputEl() { return document.getElementById("output"); }
  function setOutput(text) {
    const el = getOutputEl();
    if (el) el.textContent = text || "";
  }

  function getTrackerList() {
    try {
      const raw = localStorage.getItem(storageKey + "_tracker");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  function setTrackerList(arr) {
    try { localStorage.setItem(storageKey + "_tracker", JSON.stringify(arr)); } catch {}
  }

  function getDirectoryList() {
    try {
      const raw = localStorage.getItem(storageKey + "_dir");
      return raw ? JSON.parse(raw) : ["Sample A", "Sample B", "Sample C"];
    } catch { return ["Sample A", "Sample B", "Sample C"]; }
  }
  function setDirectoryList(arr) {
    try { localStorage.setItem(storageKey + "_dir", JSON.stringify(arr)); } catch {}
  }

  document.getElementById("copyBtn")?.addEventListener("click", function() {
    const text = getOutputEl()?.textContent || "";
    if (!text) return;
    navigator.clipboard.writeText(text).then(function() {
      this.textContent = "Copied!";
      setTimeout(function() { this.textContent = "Copy"; }.bind(this), 1500);
    }.bind(this));
  });

  document.getElementById("clearBtn")?.addEventListener("click", function() {
    setOutput("");
    if (document.getElementById("inputText")) document.getElementById("inputText").value = "";
    if (document.getElementById("inputA")) document.getElementById("inputA").value = "";
    if (document.getElementById("inputB")) document.getElementById("inputB").value = "";
  });

  if (type === "tracker") {
    function renderTracker() {
      const list = getTrackerList();
      const el = document.getElementById("trackerList");
      if (!el) return;
      el.innerHTML = list.map(function(item, i) {
        return "<div class="tracker-item"><span>" + item.replace(/</g, "&lt;") + "</span><button type="button" data-i="" + i + "" class="btn btn-small">Remove</button></div>";
      }).join("");
      el.querySelectorAll("[data-i]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          const idx = parseInt(this.getAttribute("data-i"), 10);
          const arr = getTrackerList();
          arr.splice(idx, 1);
          setTrackerList(arr);
          renderTracker();
          setOutput(arr.length ? arr.join("\n") : "No items yet.");
        });
      });
    }
    document.getElementById("addBtn")?.addEventListener("click", function() {
      const input = document.getElementById("inputItem");
      const v = (input?.value || "").trim();
      if (!v) return;
      const arr = getTrackerList();
      arr.push(v);
      setTrackerList(arr);
      if (input) input.value = "";
      renderTracker();
      setOutput(arr.join("\n"));
    });
    renderTracker();
  }

  if (type === "directory") {
    document.getElementById("inputSearch")?.addEventListener("input", function() {
      (function() { 
      const list = getDirectoryList();
      const q = (document.getElementById("inputSearch")?.value || "").toLowerCase();
      const filtered = q ? list.filter(i => i.toLowerCase().includes(q)) : list;
      setOutput(filtered.length ? filtered.join("\n") : "No items match.");
     })();
    });
  }

  document.getElementById("toolForm")?.addEventListener("submit", function(e) {
    e.preventDefault();
    (function() { 
      const text = (document.getElementById("inputText")?.value || "").trim();
      if (!text) { setOutput("Enter input first."); return; }
      const words = text.split(/\s+/).filter(Boolean);
      setOutput("Processed: " + words.length + " word(s).\n\n" + text.slice(0, 500));
     })();
  });
})();