/* Mobile Dock - Slide-Up Menu Toggle */
function toggleMobileDockMenu() {
    var overlay = document.getElementById('mobileDockOverlay');
    var panel = document.getElementById('mobileDockPanel');
    if (overlay && panel) {
        overlay.classList.toggle('open');
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) {
            panel.scrollTop = 0;
        }
    }
}
