/*@flow*/
'use strict';

const Esyr = require('./esyr.js');

const testRepo = (repo, expect) => {
    if (Array.isArray(repo)) { return void repo.forEach((r) => { testRepo(r, expect); }); }
    const out = {};
    Esyr.repository(repo, out);
    const outS = JSON.stringify(out);
    const expectS = JSON.stringify(expect);
    if (outS !== expectS) { throw new Error('\n' + outS + ' !==\n' + expectS + '\nInput: ' + repo); }
};
testRepo([
    "https://github.com/cjdelisle/esyr.git",
    "https://github.com/cjdelisle/esyr"
], {
    repository: { type: "git", url: "git+https://github.com/cjdelisle/esyr.git" },
    bugs: { url: "https://github.com/cjdelisle/esyr/issues" },
    homepage: "https://github.com/cjdelisle/esyr#readme"
});
testRepo([
    "git://github.com/cjdelisle/esyr.git",
    "git://github.com/cjdelisle/esyr"
], {
    repository: { type: "git", url: "git://github.com/cjdelisle/esyr.git" },
    bugs: { url: "https://github.com/cjdelisle/esyr/issues" },
    homepage: "https://github.com/cjdelisle/esyr#readme"
});
testRepo([
    "git@github.com:cjdelisle/esyr.git",
    "git@github.com:cjdelisle/esyr"
], {
    repository: { type: "git", url: "git+ssh://git@github.com/cjdelisle/esyr.git" },
    bugs: { url: "https://github.com/cjdelisle/esyr/issues" },
    homepage: "https://github.com/cjdelisle/esyr#readme"
});