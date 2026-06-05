(function registerExecutiveFeature(global) {
  global.QuantumExecutive = {
    loadOverview(date) {
      return global.loadExecutiveOverview?.(date);
    },
    renderOverviewCard() {
      return global.renderExecutiveOverviewCard?.();
    },
    renderAssignments() {
      return global.renderExecutiveAssignments?.();
    },
    renderTaskReport() {
      return global.renderTaskReport?.();
    },
    refreshTaskSummaryWidget() {
      return global.refreshTaskSummaryWidget?.();
    },
  };
})(window);
