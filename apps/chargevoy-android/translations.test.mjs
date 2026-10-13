import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./src/chargevoy.js',import.meta.url),'utf8');
const fragment=source.slice(source.indexOf('      const I18N_EN'),source.indexOf('      function translateElementAttributes'));
const context=vm.createContext({localStorage:{getItem:()=>null}});vm.runInContext(fragment,context);
test('English covers new app cards, filters, scenario and route actions',()=>{
 vm.runInContext('currentLanguage="en"',context);
 for(const [pt,en] of [['★ RECOMENDADO PARA SI','★ RECOMMENDED FOR YOU'],['Repor todos os filtros','Reset all filters'],['O teu carregamento','Your charging session'],['✕ Limpar rota','✕ Clear route']])assert.equal(context.translateString(pt),en);
});
test('dynamic route translation preserves stop counts, model name, consumption and reserve',()=>{
 assert.equal(context.translateString('⚡ Plano recomendado: 6 paragens · 84 min a carregar.'),'⚡ Recommended plan: 6 charging stops · 84 min charging.');
 assert.match(context.translateString('⚠ Foram encontradas 5 paragens possíveis, mas não é possível completar a rota mantendo 15% de reserva. Experimente aumentar a bateria inicial ou reduzir a reserva.'),/5.*15%/);
 assert.equal(context.translateString('  chegada estimada com 21%.  '),'  estimated arrival with 21%.  ');
 const text='Estimativa para Tesla Model 3 RWD, consumo de referência de 14,5 kWh/100 km e margem de planeamento de 15% (16,7 kWh/100 km). Valores estimados por modelo/versão; velocidade, temperatura, vento, relevo e estado da bateria alteram o resultado. Inclui curva média de carregamento, 4 minutos de operação por paragem e aproximadamente 4,2 km de desvios.';
 const translated=context.translateString(text);assert.match(translated,/Estimate for Tesla Model 3 RWD/);assert(translated.includes('14,5'));assert(translated.includes('16,7'));assert(translated.includes('4,2'));
});
test('Portuguese remains unchanged and unknown provider/place/model names are preserved',()=>{
 assert.equal(context.translateString('myAtlante · Marinha Grande'),'myAtlante · Marinha Grande');vm.runInContext('currentLanguage="pt"',context);
 assert.equal(context.translateString('⚡ Plano recomendado: 6 paragens · 84 min a carregar.'),'⚡ Plano recomendado: 6 paragens · 84 min a carregar.');
});
