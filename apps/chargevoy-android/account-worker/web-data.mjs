const plain = value => value && typeof value==='object' && !Array.isArray(value);
const only=(value,keys)=>plain(value)&&Object.keys(value).every(k=>keys.includes(k));
const label=x=>typeof x==='string'&&x.trim().length>0&&x.length<=300;
export function validRoute(data) {
  return only(data,['origin_label','destination_label','distance_km','charging_minutes']) && label(data.origin_label) && label(data.destination_label) && typeof data.distance_km==='number' && Number.isFinite(data.distance_km) && data.distance_km>=0 && data.distance_km<=30000 && Number.isInteger(data.charging_minutes) && data.charging_minutes>=0 && data.charging_minutes<=30000;
}
export function validReview(data) {
  return only(data,['rating','comment'])&&Number.isInteger(data.rating)&&data.rating>=1&&data.rating<=5&&(data.comment===null || (typeof data.comment==='string'&&data.comment.length<=1000));
}
