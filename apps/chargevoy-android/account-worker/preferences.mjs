// Versioned, private preferences. No location, route, credential or catalogue data.
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const only = (x, keys) => object(x) && Object.keys(x).every(k => keys.includes(k));
const strings = (x, max, allowed) => Array.isArray(x) && x.length <= max && new Set(x).size === x.length && x.every(v => typeof v === 'string' && v.length <= 160 && (!allowed || allowed.includes(v)));
export function validPreferenceChange(key, value) {
  if (value === null) return ['vehicle','filters','battery','language'].includes(key);
  if (key === 'language') return ['pt','en'].includes(value);
  if (key === 'battery') return only(value,['start','target']) && Number.isInteger(value.start) && Number.isInteger(value.target) && value.start >= 0 && value.target <= 100 && value.start < value.target;
  if (key === 'vehicle') {
    if (!only(value,['id','specs']) || typeof value.id !== 'string' || !/^[a-zA-Z0-9:_-]{1,160}$/.test(value.id) || !only(value.specs,['battery_capacity_kwh','consumption_wh_km','max_dc_power_kw'])) return false;
    return Object.entries(value.specs).every(([k,v]) => {const [min,max] = {battery_capacity_kwh:[15,125],consumption_wh_km:[100,400],max_dc_power_kw:[30,400]}[k];return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;});
  }
  if (key === 'filters') return only(value,['powers','connectors','statuses','operators']) && strings(value.powers,4,['0-50','50-150','150-250','250+']) && strings(value.connectors,4,['CCS','Type 2','CHAdeMO','Tesla']) && strings(value.statuses,3,['available','unavailable','unknown']) && strings(value.operators,100);
  return false;
}
export function validatePreferencePatch(body) {
  return only(body,['baseRevision','changes']) && Number.isSafeInteger(body.baseRevision) && body.baseRevision >= 0 && only(body.changes,['vehicle','filters','battery','language']) && Object.keys(body.changes).length > 0 && Object.entries(body.changes).every(([key,value]) => validPreferenceChange(key,value));
}
