// Shared resize-floor helper for DOM-widget nodes in the Nodes 2.0 renderer.

function isVueNodes() {
    return !!window.LiteGraph?.vueNodesMode;
}

export function measureRootContent(root) {
    if (!root) return 0;
    let h = 0;
    let count = 0;
    for (const child of root.children) {
        if (child.offsetParent === null) continue;
        h += child.offsetHeight;
        count += 1;
    }
    const cs = getComputedStyle(root);
    const gap = parseFloat(cs.rowGap || cs.gap) || 0;
    if (count > 1) h += gap * (count - 1);
    h += (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    return h;
}

export function installResizeFloor(root, measureFn, onRelease) {
    if (!root || typeof measureFn !== "function") return () => {};
    let armed = false;

    const clear = () => {
        if (!armed) return;
        armed = false;
        try { root.style.minHeight = ""; } catch (_e) {}
        if (typeof onRelease === "function") { try { onRelease(); } catch (_e) {} }
    };

    const onDown = (e) => {
        if (!isVueNodes() || !root.isConnected) return;
        if (e.target?.closest?.(".lg-node-widget")) return;
        let cur = "";
        try { cur = (e.target && window.getComputedStyle(e.target).cursor) || ""; } catch (_e) {}
        if (cur.indexOf("resize") === -1) return;
        const myNode = root.closest(".lg-node");
        const downNode = e.target.closest && e.target.closest(".lg-node");
        if (myNode && downNode && myNode !== downNode) return;
        let h = 0;
        try { h = measureFn(root); } catch (_e) { return; }
        if (!(h > 0)) return;
        try { root.style.minHeight = Math.round(h) + "px"; armed = true; } catch (_e) {}
    };

    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", clear, true);
    window.addEventListener("pointercancel", clear, true);

    return () => {
        window.removeEventListener("pointerdown", onDown, true);
        window.removeEventListener("pointerup", clear, true);
        window.removeEventListener("pointercancel", clear, true);
        clear();
    };
}
