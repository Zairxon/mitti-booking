/* ранний запрос данных клиники: идёт параллельно с загрузкой кода, результат подхватывает main.js */
(function () { try {
  var u = 'https://fiphqnbvnlbsgoqdewae.supabase.co/rest/v1/rpc/', k = 'sb_publishable_EyHYtGPAe9ay86lCCW9ONA_VbbsHx4e';
  var f = function (n) { return fetch(u + n, { method: 'POST', headers: { apikey: k, 'Content-Type': 'application/json' }, body: '{}' }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(n)); }); };
  window.__pre = { t: Date.now(), public_info: f('public_info'), public_days: f('public_days') };
  window.__pre.public_info.catch(function () {}); window.__pre.public_days.catch(function () {});
} catch (e) { /* без раннего запроса */ } })();
