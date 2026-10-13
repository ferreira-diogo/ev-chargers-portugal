export function prepareWebCatalogue(parsed, previous) {
  const valid = row => Number.isFinite(row.latitude) && Number.isFinite(row.longitude) &&
    row.latitude >= 30 && row.latitude <= 43 && row.longitude >= -32 && row.longitude <= -5;
  const quarantined = parsed.stations.filter(row => !valid(row));
  if (quarantined.length > Math.min(100, parsed.stations.length * .01)) throw Error('NAP coordinate quarantine exceeds 1%/100 sites');
  const stations = parsed.stations.filter(valid);
  const ids = new Set(stations.map(row => row.external_id));
  if (ids.size !== stations.length) throw Error('Duplicate NAP sites');
  const allIds = new Set(parsed.stations.map(row => row.external_id));
  if (parsed.connectors.some(row => !allIds.has(row.station_external_id))) throw Error('Orphan NAP connector');
  const connectors = parsed.connectors.filter(row => ids.has(row.station_external_id));
  if (new Set(connectors.map(row => row.external_id)).size !== connectors.length) throw Error('Duplicate NAP connectors');
  if (stations.length < 8000 || connectors.length < 17000) throw Error('NAP coverage below publication minimum');
  const published = Date.parse(parsed.publicationTime);
  if (!Number.isFinite(published) || published > Date.now() + 300000) throw Error('Invalid NAP publication time');
  if (!previous?.stations?.length || !previous?.connectors?.length || !Number.isFinite(Date.parse(previous.publication_time))) throw Error('Previous published catalogue required for regression checks');
  if (published < Date.parse(previous.publication_time) || stations.length < previous.stations.length * .95 || connectors.length < previous.connectors.length * .95) throw Error('NAP publication/coverage regression; retain previous snapshot');
  return {parsed:{...parsed, stations, connectors}, report:{publication_time:parsed.publicationTime,
    source_sites:parsed.stations.length, published_sites:stations.length, published_connectors:connectors.length,
    excluded_connectors:parsed.connectors.length-connectors.length,
    quarantined:quarantined.map(row => ({id:row.external_id,latitude:row.latitude,longitude:row.longitude,reason:'invalid_coordinates'}))}};
}
