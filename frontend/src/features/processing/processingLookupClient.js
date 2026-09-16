const asArray = (value) => (Array.isArray(value) ? value : []);

const normalizeValue = (value) => String(value ?? '').trim();

const uniqueValues = (values) => [
  ...new Map(
    asArray(values)
      .map(normalizeValue)
      .filter(Boolean)
      .map((value) => [value.toUpperCase(), value]),
  ).values(),
];

export const getProcessingFilters = () => ({
  productionFor: normalizeValue(localStorage.getItem('production_for_filter')),
  location: normalizeValue(localStorage.getItem('plant_location_filter')),
});

export const buildProcessingUrl = (path) => {
  const { productionFor, location } = getProcessingFilters();
  const params = new URLSearchParams({ format: 'json' });

  if (productionFor && productionFor.toUpperCase() !== 'ALL') {
    params.set('production_for', productionFor);
  }
  if (location && location.toUpperCase() !== 'ALL') {
    params.set('location', location);
    params.set('peeling_at', location);
  }

  return `${path}?${params.toString()}`;
};

export async function fetchProcessingPage(path, signal) {
  const response = await fetch(buildProcessingUrl(path), {
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body.detail || body.error || body.message || '';
    } catch {
      // Keep the HTTP status when the response is not JSON.
    }
    throw new Error(detail || `Unable to load processing data (${response.status}).`);
  }

  return response.json();
}

export const normalizeLookupList = uniqueValues;

export const selectLookupValue = (currentValue, preferredValue, values) => {
  const options = uniqueValues(values);
  const findMatchingValue = (value) => {
    const normalized = normalizeValue(value).toUpperCase();
    return options.find((option) => option.toUpperCase() === normalized);
  };

  return findMatchingValue(currentValue) || findMatchingValue(preferredValue) || options[0] || '';
};
