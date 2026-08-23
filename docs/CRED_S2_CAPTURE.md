# CRED S2 — ENDPOINT CAPTURE (R1-CONFIRMED homework) · 2026-08-22

Investigation record for the five direct sources on the v1 PSV path (R1, R1-CONFIRMED).
Everything below was OBSERVED on 2026-08-22 from `main @ 3ac7eef`; anything not observed
is marked **UNOBSERVED** — never inferred. The build (`src/credential/*`) consumes these
shapes; when a source drifts, this file is what the drift is measured against.

Method: Google Chrome 151.0.7922.170, `--headless=new --remote-debugging-port=9333
--log-net-log=netlog-discovery.json --net-log-capture-mode=Everything`, driven over the
DevTools protocol (Node 24 global WebSocket; no puppeteer in the repo). Searches were
driven by DOM `input` events + the real Search button (the Angular `scope()` hook fails on
these production bundles — `debugInfoEnabled(false)`). Netlog closed via `Browser.close`:
347,200,780 bytes, 276,752 events. Direct `curl` replays then isolated each server-side
requirement. NPPES and LEIE were fetched directly (documented surfaces).

---

## 0. Raw netlog evidence (verbatim lines)

```
[708038915] src=2210 URL_REQUEST_START_JOB method=POST url=https://omb.oregon.gov/api/licensee-search
[708054156] src=2310 URL_REQUEST_START_JOB method=GET  url=https://oblpct.us.thentiacloud.net/rest/public/registrant/search/?keyword=Smith&supervisor=0&filter=all&skip=0&take=10&dsrList=0
[708069659] src=2421 URL_REQUEST_START_JOB method=GET  url=https://obop.us.thentiacloud.net/rest/public/registrant/search/?keyword=Smith&supervisor=0&filter=all&skip=0&take=10
[708117864] src=2769 URL_REQUEST_START_JOB method=POST url=https://omb.oregon.gov/api/licensee-search
[708140141] src=2881 URL_REQUEST_START_JOB method=GET  url=https://oblpct.us.thentiacloud.net/rest/public/registrant/search/?keyword=C7918&supervisor=0&filter=all&skip=0&take=10&dsrList=0
[708147590] src=2909 URL_REQUEST_START_JOB method=GET  url=https://oblpct.us.thentiacloud.net/rest/public/registrant/get/?id=65b913642f4f44072471bb95&_=1787427395381
[708161618] src=3007 URL_REQUEST_START_JOB method=GET  url=https://obop.us.thentiacloud.net/rest/public/registrant/search/?keyword=2869&supervisor=0&filter=all&skip=0&take=10
[708169136] src=3049 URL_REQUEST_START_JOB method=GET  url=https://obop.us.thentiacloud.net/rest/public/registrant/get/?id=65c65c582f4f4460fcf86467&_=1787427416927
[708211521] src=3097 URL_REQUEST_START_JOB method=GET  url=https://omb.oregon.gov/Clients/ORMB/Public/VerificationDetails.aspx?EntityID=1546002

[708117864] src=1673 HTTP2_SESSION_SEND_HEADERS stream=141 [':method: POST', ':authority: omb.oregon.gov', ':path: /api/licensee-search', 'accept: application/json, text/plain, */*', 'content-type: application/json;charset=UTF-8']
[708119656] src=1673 HTTP2_SESSION_RECV_HEADERS stream=141 [':status: 200', 'cache-control: no-cache', 'content-type: application/json; charset=utf-8']
[708140142] src=2270 HTTP2_SESSION_SEND_HEADERS stream=31  [':method: GET', ':authority: oblpct.us.thentiacloud.net', ':path: /rest/public/registrant/search/?keyword=C7918&supervisor=0&filter=all&skip=0&take=10&dsrList=0', 'accept: application/json, text/plain, */*']
[708144013] src=2270 HTTP2_SESSION_RECV_HEADERS stream=31  [':status: 200', 'content-type: application/json', 'server: Apache']
[708147590] src=2270 HTTP2_SESSION_SEND_HEADERS stream=37  [':method: GET', ':authority: oblpct.us.thentiacloud.net', ':path: /rest/public/registrant/get/?id=65b913642f4f44072471bb95&_=1787427395381', ...]
[708148486] src=2270 HTTP2_SESSION_RECV_HEADERS stream=37  [':status: 200', 'content-type: application/json', 'server: Apache']
[708161618] src=2270 HTTP2_SESSION_SEND_HEADERS stream=45  [':method: GET', ':authority: obop.us.thentiacloud.net', ':path: /rest/public/registrant/search/?keyword=2869&supervisor=0&filter=all&skip=0&take=10', ...]
[708169136] src=2270 HTTP2_SESSION_SEND_HEADERS stream=49  [':method: GET', ':authority: obop.us.thentiacloud.net', ':path: /rest/public/registrant/get/?id=65c65c582f4f4460fcf86467&_=1787427416927', ...]
[708169976] src=2270 HTTP2_SESSION_RECV_HEADERS stream=49  [':status: 200', 'content-type: application/json', 'server: Apache']
[708211582] src=1673 HTTP2_SESSION_RECV_HEADERS stream=143 [':status: 200', 'cache-control: private', 'content-type: text/html; charset=utf-8']   <- VerificationDetails.aspx
```

---

## 1. Oregon Medical Board — `omb.oregon.gov/search`

AngularJS 1.8.2 app (`data-ng-app="alx"`, bundle `/angular-dist/alx/alx.min.js`, templates under
`/angular-dist/alx/**`). Search form fields (`alxForm.html`): `lastName`, `firstName`,
`nameMatch` (Exact|Contains), `licenseNumber`, `cityZip`, `distance`, `addresses`.
Bundle endpoint strings: `/api/licensee-search`, `/api/licensee-search/options`,
`/api/public-feedback`. Legacy `verification.aspx` still serves (ASPX form) — not used.

**Three calls per verification, session-bound AND token-bound:**

### 1.1 `GET https://omb.oregon.gov/api/licensee-search/options`
- 200 `application/json; charset=utf-8`, `cache-control: no-cache`.
- Sets `Set-Cookie: ASP.NET_SessionId=<id>; path=/; secure; HttpOnly; SameSite=Lax`.
- Body: `{"s":"zof2e4rjains0brdfc2d0twb","optionList":[...]}` — `s` observed EQUAL to the
  cookie value. `optionList` (order, label, value, #options):
  `(1,'Specialty','specialty',221) (2,'License Type','license',6) (3,'License Status','status',1)
  (4,'Oregon County','county',36) (5,'Gender','gender',3) (6,'Language','language',97)`.
  License Type values: `['md,do','dpm','pa','ac','limited','5np']`. License Status values:
  `['Actively Practicing']`.

### 1.2 `POST https://omb.oregon.gov/api/licensee-search`
- Request headers (browser): `accept: application/json, text/plain, */*`,
  `content-type: application/json;charset=UTF-8`.
- Captured body (license-number search):
  `{"distance":"5","nameMatch":"Exact","address":"All","licenseNumber":"MD198586","pagenumber":1,"token":"9b0eb348feb796c1411a8167783dd07e"}`
- Captured body (name search):
  `{"distance":"5","nameMatch":"Exact","address":"All","lastName":"Smith","pagenumber":1,"token":"8e002aa5f01a0e5a787fab4843855ad0"}`
- **Token derivation** (from `alx.min.js`, quoted):
  `t=lastName, r=firstName, l=licenseNumber, n=cityZip, o=[t,r,l,n,e||""].join(""),
  i=a(unescape(encodeURIComponent(o))), g.searchParams.token=i` — `a` is an inlined MD5
  (the `e<<a|e>>>32-a` / `(65535&e)+(65535&a)` rotate-add helpers are MD5's), `e` is
  `options.s`. Confirmed by recomputation against both captured tokens:
  `md5("Smith"+"g02zntcy2h2wxtymj0mlbq3o") = 8e002aa5f01a0e5a787fab4843855ad0  MATCH`
  `md5("MD198586"+"g02zntcy2h2wxtymj0mlbq3o") = 9b0eb348feb796c1411a8167783dd07e  MATCH`
- **Server requirements, isolated by curl** (cookie + correct token held constant):
  | variant | result |
  |---|---|
  | `Referer: https://omb.oregon.gov/search` | full `searchResults` |
  | `Origin` only | `{"Message":""}` |
  | browser `User-Agent` only | `{"Message":""}` |
  | none of the three | `{"Message":""}` |
  | Referer, correct token, NO cookie | `{"Message":""}` |
  | Referer, cookie, WRONG token | `{"Message":""}` |
  **All of: session cookie + `md5(fields+s)` + Referer are required. The failure shape is
  HTTP 200 with body `{"Message":""}` — never a 4xx.**
- Response (verbatim, license search):
  `{"searchResults":[{"total":1,"mapZoom":13,"pageNumber":1,"licensees":[{"entityId":1546002,"lastName":"Bellsmith","firstName":"Kellyn","middleName":"Nacke","license":{"number":"MD198586","status":"Active","type":"MD License"},"addresses":[{"type":"Practice Address","priority":"PRIMARY","street1":"545 SW Campus Dr","street2":"","city":"Portland","state":"OR","county":"Multnomah","country":"United States","zip":"97239","longitude":-122.688360000,"latitude":45.499030000}]}]}]}`
- Unknown number: `{"searchResults":[{"total":0,"mapZoom":13,"pageNumber":1}]}` (no `licensees` key).
- Name search "Smith": `total: 467`, 10 per page; licensee rows may omit `addresses`.
- `license.status` values observed: `Active`, `Retired`, `Lapsed`, `Expired`, `Telemedicine Active`.
  `license.type` observed: `MD License`, `AC License`.
- **Not in this payload: expiration, discipline.**

### 1.3 `GET https://omb.oregon.gov/Clients/ORMB/Public/VerificationDetails.aspx?EntityID=<entityId>`
- Server-rendered ASPX, `cache-control: private`. Renders fully with the session cookie
  (curl with the cookie jar → all fields). A single earlier no-cookie curl returned the page
  with blank fields — observed once, not re-tested.
- Text fields observed (whitespace-collapsed):
  `Information current as of 08/22/2026 12:37:39 PM` · `Verification ID: caed1e1d-be24-4945-8209-1cacb4fb6b9f`
  (fresh GUID per render; `c926545f-...` on the curl render) · `Bellsmith, Kellyn Nacke, MD` ·
  `MD License: MD198586` · `Originally Issued: 04/28/2020` · `Current Status: Active` ·
  `Status Effective: 01/01/2026` · `Expires: 12/31/2027` · `Basis: USMLE` ·
  `Expedited Endorsement: No` · Other Licenses table rows
  `PG193766 07/01/2019 04/28/2020 MD Postgraduate License` … · `Specialty : Ophthalmology`
  ("self-reported by the licensee") · Education / Post-Graduate Training tables ·
  `Board Actions There are no current or prior Board actions or agreements on file for this
  licensee or registrant.` · `Malpractice To search for closed malpractice claim information…`.
- Page self-description: "This site is a primary source for verification of license
  credentials consistent with Joint Commission and NCQA standards."
- Markup for a positive case exists (`#modBoardOrders`, "Board Actions issued from January 1,
  1998 until the present") — **UNOBSERVED: how a licensee WITH board actions renders.**
  Capture errand (Derrick): open this page for a licensee on the Board's disciplinary list and
  paste the Board Actions section HTML.
- Field coverage: name ✔ (JSON) · status ✔ (JSON + HTML) · expiration ✔ (HTML only) ·
  discipline ✔ negative case only (HTML only).

---

## 2. OBLPCT — `oblpct.us.thentiacloud.net/webs/oblpct/register/`

Thentia Cloud "helsbydrake.register" AngularJS bundle
(`/webs/oblpct/scripts/helsbydrake.register.all.min.js?v=1.8.31`). SPA-over-REST confirmed.
Search template `/webs/oblpct/register/search.php`: filter `<select>` options
`all|firstname|lastname|license|cityzip|language`; checkboxes `supervisor`
("Only show licensees on the Supervisor Registry") and `dsrList`. Route after submit:
`#/search/<keyword>/<filter>/<supervisor>/<dsrList>/10/0`; profile route
`#/profile/<keyword>/<supervisor>/<dsrList>/10/0/<id>`.

### 2.1 `GET https://oblpct.us.thentiacloud.net/rest/public/registrant/search/?keyword=<kw>&supervisor=0&filter=<f>&skip=0&take=10&dsrList=0`
- 200 `application/json`, `server: Apache`. Request header `accept: application/json, text/plain, */*`.
- Body (verbatim, `keyword=C7918&filter=all`):
  `{"errorCode":"0","errorMessage":"","method":"GET","resultCount":1,"result":[{"id":"65b913642f4f44072471bb95","profileId":"5ffde31881edb519177ed277","name":"Leslie Atwell","firstName":"Leslie","lastName":"Atwell","middleName":"Rose","otherName":"Smith","licenseNumber":"C7918","licenseCategory":"LPC","licenseStatus":"Active","placeOfPracticeStreet":null,"placeOfPracticeCity":"Eugene","placeOfPracticeZipCode":"97404","initialLicenseDate":null,"licenseExpirationDate":null,"supervisorCategory":null,"languages":[],"placesOfPractice":[],"educationDetails":[],"registrationRecords":[],"publicNotices":[],"memberships":[],"disciplinarySupervisorCompetencies":[],"profileSupervisorData":null,"approvedAppications":[],"isPlacedOnDsrList":null}]}`
- Unknown: `{"errorCode":"0","errorMessage":"","method":"GET","resultCount":0,"result":[]}`.
- **List rows carry the dates as `null`** — the `get` call fills them.
- Name search "Smith": `resultCount: 237`; one person has several rows (one per license,
  e.g. `R6929` Professional Counselor Associate / Expired and `C7918` LPC / Active, same
  `profileId`).
- `licenseCategory` observed: `LPC`, `Professional Counselor Associate`. `licenseStatus`
  observed: `Active`, `Expired`.

### 2.2 `GET https://oblpct.us.thentiacloud.net/rest/public/registrant/get/?id=<result.id>`
- Full record (verbatim, trimmed):
  `{"id":"65b913642f4f44072471bb95","profileId":"5ffde31881edb519177ed277","name":"Leslie Atwell","firstName":"Leslie","lastName":"Atwell","middleName":"Rose","otherName":"Smith","licenseNumber":"C7918","licenseCategory":"LPC","licenseStatus":"Active","placeOfPracticeStreet":null,"placeOfPracticeCity":"Eugene","placeOfPracticeZipCode":"97404","initialLicenseDate":"Jan-30-2024","licenseExpirationDate":"Jun-30-2028","supervisorCategory":null,"languages":[],"placesOfPractice":[{"id":"619ac9f381edb52d934355c9","name":"","startDate":null,"endDate":null,"primary":false,"registrant":null,"phone":"(541) 780-6836","position":"","email":"","active":false,"employerName":"Elrod Center","businessAddress":"105 E Hilliard Ln.","businessCity":"Eugene","businessState":"Oregon","businessZipCode":"97404","organization":"","practiceLimitations":[]},{...,"active":true,"employerName":"Avodah Therapy Services",...}],"educationDetails":[],"registrationRecords":[],"publicNotices":[],"memberships":[{"id":null,"name":null,"registrationNumber":"C7918","initialRegistrationDate":"Jan-30-2024","expirationRegistrationDate":"Jun-30-2028","classOfRegistration":"LPC","registrationStatus":"Active"},{"id":null,"name":null,"registrationNumber":"R6929","initialRegistrationDate":"Jun-08-2021","expirationRegistrationDate":"Jan-30-2024","classOfRegistration":"Professional Counselor Associate","registrationStatus":"Expired"}],"disciplinarySupervisorCompetencies":[],"profileSupervisorData":{"or_lpc_supervisortypeid":{"connectedspace":"or_supervisortype","connectedspaceid":null,"value":null,"text":null},"or_supervisor_credential_title":null,"or_supervisor_expiration_date":null,"or_supervisor_issue_date":null,"or_supervisor_certification_number":null,"or_lmft_supervisortypeid":{...},"or_supervisor_approved":null,"or_supervisor_organization":null},"approvedAppications":[],"isPlacedOnDsrList":null}`
- Date format: `Mon-DD-YYYY` (`Jan-30-2024`).
- UI renders from this payload: "Legal Last Name / Legal First Name / Previous or Other Names /
  License Category / License Status / Initial License Date / Expiration Date / Languages /
  **Disciplinary Actions** — Note: Only includes actions that are reportable to the National
  Practitioner Databank (NPDB). — None. / Practice Locations / Memberships / License History".
  The `publicNotices:[]` ↔ "None." correspondence is the only case seen.
- **UNOBSERVED:** the populated shape of `publicNotices` (a disciplined licensee); the meaning
  of `dsrList` / `isPlacedOnDsrList`; `registrationRecords` populated on OBLPCT (it is on OBOP).
  Capture errand (Derrick): a profile from the Board's disciplinary list → copy the
  `/rest/public/registrant/get/` JSON from devtools.

### 2.3 Match semantics and gates
- `filter=all` is a SUBSTRING match across fields including ids: on OBOP, `keyword=2869`
  returned 4 rows, one (`3825 Cheng`) because its `profileId` is `62869b81…`.
- `filter=license` narrows but is still substring: `7918` → `C7918` (Atwell) AND `R7918`
  (Wilmarth). **Exactness must be enforced by the caller: `result.licenseNumber === input`;
  anything other than exactly one exact row → manual_review.**
- **403 gate:** default curl UA → `403 Forbidden` (nginx-style HTML). Browser-like
  `User-Agent` alone → 200. `Accept` only → 403; `Referer` only → 403; UA `node` → 403.
- **Side effect the SPA performs that a direct caller does not:** `POST /rest/public/save-log/`
  `{"url":"https://oblpct.us.thentiacloud.net/webs/oblpct/register/search/C7918/all/0/0/10/0"}`
  → 200 with an `or_registersearchlog` row (`"effi_createdon":"2026-08-22T19:35:01.814Z"`,
  owner "Web Service"). Ruled 2026-08-22 (flag 2): browser UA v1; honest-access inquiries are
  Derrick's errand; per-board switch to `Deus-PSV/1.0` DEFERRED as granted.

---

## 3. Oregon Board of Psychology — `obop.us.thentiacloud.net/webs/obop/register/`

Same Thentia bundle (`helsbydrake.register.all.min.js?v=1.3.20`); form has `supervisor` only
(no `dsrList`). Routes: `#/search/<kw>/<filter>/<supervisor>/0/10`,
`#/profile/<kw>/<supervisor>/0/10/<id>`.

### 3.1 `GET https://obop.us.thentiacloud.net/rest/public/registrant/search/?keyword=<kw>&supervisor=0&filter=<f>&skip=0&take=10`
- `keyword=2869&filter=license` → `resultCount 1 [('2869','Coppersmith','Active')]`.
- `keyword=2869&filter=all` → `resultCount 4` (substring on ids — see 2.3).
- Row shape (verbatim, trimmed): `{"id":"6074cfe8b952d62dd4051e49","profileId":"6074382cb952d6177c1ca9a3","name":"Kimberly L. Coppersmith","firstName":"Kimberly L.","lastName":"Coppersmith","middleName":"N/A","otherName":"","licenseNumber":"2869","licenseCategory":"Psychologist","licenseStatus":"Active","placeOfPracticeCity":"Portland","placeOfPracticeZipCode":"97205","initialLicenseDate":null,"licenseExpirationDate":null,"isSupervisor":null,"training":null,"specialty":null,"publicAddress":null,"publicAddressCity":"Portland","publicAddressZipCode":"97205","languages":[],"placesOfPractice":[],"registrationRecords":[],"publicNotices":[],"memberships":[]}`
  — note `name` may be prefixed `"<number> - <name>, <category>"` on some rows
  (`"1221 - Adeyinka Akinsulure-Smith, Psychologist Visitor's Permit"`), `middleName:"N/A"`,
  and first names carrying an initial (`"Kimberly L."`, `"Jennifer K."`) — S3 normalization inputs.
- `licenseCategory` observed: `Psychologist`, `Psychologist Visitor's Permit`. `licenseStatus`
  observed: `Active`, `Expired`, `Retired`.

### 3.2 `GET https://obop.us.thentiacloud.net/rest/public/registrant/get/?id=<id>`
- `id=6074cfe8b952d62dd4051e49` (license 2869): `{"licenseNumber":"2869","firstName":"Kimberly L.","lastName":"Coppersmith","middleName":"N/A","otherName":"","licenseCategory":"Psychologist","licenseStatus":"Active","initialLicenseDate":"Oct-25-2017","licenseExpirationDate":"Sep-30-2026","publicNotices":[],"registrationRecords":[{"registrationStatus":"Active","effectiveDate":""},{"registrationStatus":"Active","effectiveDate":"Oct-01-2024"},{"registrationStatus":"Active","effectiveDate":"Oct-01-2022"},...]}`
- `id=65c65c582f4f4460fcf86467` (license 3825, verbatim trimmed): `{"id":"65c65c582f4f4460fcf86467","profileId":"62869b8104f43667b8f65554","name":"3825 - Pei-Han Cheng, Psychologist","firstName":"Pei-Han","lastName":"Cheng","middleName":"N/A","otherName":"Pei-Han Cheng","licenseNumber":"3825","licenseCategory":"Psychologist","licenseStatus":"Active","placeOfPracticeCity":null,"placeOfPracticeZipCode":null,"initialLicenseDate":"Feb-09-2024","licenseExpirationDate":"Apr-30-2028","isSupervisor":null,"training":null,"specialty":null,"publicAddress":"N/A, Portland, Oregon 97209, United States of America","publicAddressCity":"Portland","publicAddressZipCode":"97209","languages":["Mandarin"],"placesOfPractice":[],"registrationRecords":[{"id":"663220bb1aa80f84fcac6586","name":null,"oldClassOfRegistration":null,"oldRegistrationStatus":null,"classOfRegistration":"Psychologist","registrationStatus":"Active","effectiveDate":"May-01-2024","effectiveEndDate":null,"summary":null,"visible":true},...],"publicNotices":[],"memberships":[{"id":null,"name":null,"registrationNumber":"3825","initialRegistrationDate":"Feb-09-2024","expirationRegistrationDate":"Apr-30-2028","classOfRegistration":"Psychologist","registrationStatus":"Active"}]}`
- UI: "Disciplinary Actions — None. Note: Only includes actions that are reportable to the
  NPDB" + "About License Statuses" link + License History from `registrationRecords`.
- Same UA gate and substring semantics as OBLPCT. **UNOBSERVED:** populated `publicNotices`.

---

## 4. NPPES NPI Registry API (documented)

- `GET https://npiregistry.cms.hhs.gov/api/?version=2.1&number=1003000126` → 200 in 0.30 s,
  no auth, no key. Verbatim (trimmed):
  `{"result_count":1,"results":[{"addresses":[{"address_1":"6410 ROCKLEDGE DR STE 304","address_purpose":"LOCATION","address_type":"DOM","city":"BETHESDA","country_code":"US","country_name":"United States","postal_code":"208171841","state":"MD","telephone_number":"443-602-6207"},{...,"address_purpose":"MAILING",...}],"basic":{"certification_date":"2025-05-28","credential":"M.D.","enumeration_date":"2007-08-31","first_name":"ARDALAN","last_name":"ENKESHAFI","last_updated":"2025-05-28","sex":"M","sole_proprietor":"NO","status":"A"},"created_epoch":"1188577587000","endpoints":[],"enumeration_type":"NPI-1","identifiers":[],"last_updated_epoch":"1748459039000","number":"1003000126","other_names":[],"practiceLocations":[{...}],"taxonomies":[{"code":"207R00000X","desc":"Internal Medicine","license":"D0000290","primary":false,"state":"MD","taxonomy_group":""},...,{"code":"208M00000X","desc":"Hospitalist","license":"MD600003480","primary":true,"state":"DC","taxonomy_group":""}]}]}`
- NPI-1 individual sample (`state=OR&enumeration_type=NPI-1&taxonomy_description=Psychologist`):
  `basic: {"credential":"Psy.D.","enumeration_date":"2008-09-12","first_name":"AMY","last_name":"AADLAND","last_updated":"2013-02-28","name_prefix":"--","name_suffix":"--","sex":"F","sole_proprietor":"YES","status":"A"}`,
  `taxonomies: [{"code":"103TC0700X","desc":"Psychologist, Clinical","license":"PY60199791","primary":true,"state":"WA","taxonomy_group":""}]`.
  NPI-2 organizations carry `basic.organization_name`, `authorized_official_*`, and `taxonomies[].license: null`.
- Not found: `{"result_count":0,"results":[]}` (HTTP 200).
- Malformed: `{"Errors":[{"description":"NPI must be 10 digits","field":"number","number":"06"}]}` (HTTP 200).
- `version=2.0` → `{"Errors":[{"description":"Unsupported Version","field":"version","number":"17"}]}`.
- `state=OR` alone → `Field state requires additional search criteria` (number "07").
- `limit=201` silently returns 200 results; `skip=1001` served.
- **Failure is never an HTTP status — branch on `Errors` / `result_count`.**
- `taxonomies[].license` is licensee-reported, not primary source — tie-break hint only.
- Timing observed: 0.16–0.30 s.

---

## 5. OIG LEIE (documented download; the online search is NOT an API)

- `HEAD https://oig.hhs.gov/exclusions/downloadables/UPDATED.csv` →
  `HTTP/2 200`, `content-type: text/csv`, `content-length: 15578603`,
  `last-modified: Mon, 10 Aug 2026 13:18:45 GMT`, `x-content-type-options: nosniff`.
- Header row (verbatim):
  `LASTNAME,FIRSTNAME,MIDNAME,BUSNAME,GENERAL,SPECIALTY,UPIN,NPI,DOB,ADDRESS,CITY,STATE,ZIP,EXCLTYPE,EXCLDATE,REINDATE,WAIVERDATE,WVRSTATE`
- Sample rows (verbatim):
  `"","","","#1 MARKETING SERVICE, INC","OTHER BUSINESS","SOBER HOME","","0000000000","","239 BRIGHTON BEACH AVENUE","BROOKLYN","NY","11235","1128a1","20200319","00000000","00000000",""`
  `"","","","101 FIRST CARE PHARMACY INC","OTHER BUSINESS","PHARMACY","","1972902351","","C/O 609 W 191ST STREET, APT D","NEW YORK","NY","10040","1128b8","20220320","00000000","00000000",""`
- Conventions: `NPI` = `0000000000` when none; `DOB` = `YYYYMMDD` or empty; dates `00000000`
  when none; `EXCLTYPE` is the statute code (`1128a1`, `1128b5`, `1128b8`…; authorities page
  lists `1128(a)(1)`–`(a)(4)`, `1128(b)…`, `1128(c)(3)(G)(i)`, `1128B(f)(1)`).
- Cadence (downloadables page strings): "Updated LEIE Database", "Monthly Supplements",
  "Monthly Supplement Archive", "each month".
- `exclusions.oig.hhs.gov` is an ASP.NET WebForms postback (`ctl00$cpExclusions$txtSPLastName`,
  `txtSPFirstName`, `ibSearchSP`, `__VIEWSTATE`; cookie-detect redirect loop without a jar) —
  **UNOBSERVED as a programmatic surface; not used.** Ruled: monthly ingest of UPDATED.csv
  into `public.oig_leie` (Derrick-run script); `check_exclusions` reads the mirror only.

---

## 6. Cross-source facts that shape the module

- Every source signals "not found / rejected" with HTTP 200 — OMB `{"Message":""}` or
  `total:0`; Thentia `resultCount:0` or `403` (UA); NPPES `Errors`/`result_count:0`.
- Status vocabularies observed — OMB: Active, Telemedicine Active, Retired, Lapsed, Expired;
  Thentia: Active, Expired, Retired. Anything else → `active: null` → manual_review.
- Date formats: OMB `MM/DD/YYYY` (HTML); Thentia `Mon-DD-YYYY`; NPPES `YYYY-MM-DD`;
  LEIE `YYYYMMDD`.
- Subrequests per ceremony: NPPES 1 · OMB 3 · Thentia 2 · Stripe Identity 1 · Supabase ~4
  → ≤ 11 (Workers limits fetched 2026-08-22: 50/request Free, 10,000/request Paid;
  6 simultaneous outgoing connections; 128 MB).
- Stripe Identity name fetch: `verificationSessions.retrieve(vs_id, { expand: ['verified_outputs'] })`
  → `verified_outputs.first_name / last_name` (`node_modules/stripe/cjs/resources/Identity/VerificationSessions.d.ts:188-204`);
  `dob` is R3-AMENDED-gated (restricted key, 48 h) — deferred to S3.
