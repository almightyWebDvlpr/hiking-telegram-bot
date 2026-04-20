let jsonDiffRuntime = {};

try {
  jsonDiffRuntime = await import("jsondiffpatch");
} catch {
  jsonDiffRuntime = {};
}

const diffEngine = typeof jsonDiffRuntime.create === "function"
  ? jsonDiffRuntime.create({
      arrays: {
        detectMove: false,
        includeValueOnMove: false
      }
    })
  : null;

function fallbackHasChanged(previousValue, nextValue) {
  return JSON.stringify(previousValue ?? null) !== JSON.stringify(nextValue ?? null);
}

export function buildObjectDiff(previousValue = {}, nextValue = {}) {
  if (!diffEngine) {
    return null;
  }

  try {
    return diffEngine.diff(previousValue, nextValue) || null;
  } catch {
    return null;
  }
}

export function detectChangedFields(previousValue = {}, nextValue = {}, fields = []) {
  const diff = buildObjectDiff(previousValue, nextValue);
  return fields.filter((field) => {
    if (diff && Object.prototype.hasOwnProperty.call(diff, field)) {
      return true;
    }

    return fallbackHasChanged(previousValue?.[field], nextValue?.[field]);
  });
}

export function hasMeaningfulChange(previousValue = {}, nextValue = {}) {
  const diff = buildObjectDiff(previousValue, nextValue);
  if (diff) {
    return Object.keys(diff).length > 0;
  }

  return fallbackHasChanged(previousValue, nextValue);
}
