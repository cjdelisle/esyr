#!/usr/bin/env node
/*@flow*/
'use strict';
const Child = require('child_process');
const Fs = require('fs');
const Path = require('path');
const Https = require('https');
const Readline = require('readline');

const nThen = require('nthen');
const DeepExtend = require('deep-extend');

// This is just too hard to do manually.
const validateLicense = require('validate-npm-package-license');

const HOME = require('os').homedir();
const ESY_PATH = './node_modules/.bin/esy';

const isDebug = () => { return !!process.env.ESYR_DEBUG; };
const print = (type, args) => { args.unshift("esyr " + type); console.log.apply(console, args); };
const debug = isDebug() ? (...args) => { print("DEBUG", args); } : (...args) => {};
const warn = (...args) => { print("WARN", args); };
const error = (...args) => { print("ERROR", args); };

const githubRepo = (gitUser, host, proto, user, repo, conf) => {
    if (host !== 'github.com') { return; }
    repo = repo.replace(/\.git$/, '');
    conf.repository.url = proto + '://' +
        (gitUser ? gitUser + '@' : '') + host + "/" + user + "/" + repo + ".git";
    conf.bugs = { url: "https://github.com/" + user + "/" + repo + "/issues" };
    conf.homepage = "https://github.com/" + user + "/" + repo + "#readme";
};

const repository = module.exports.repository = (repo, conf) => {
    let done = false;
    repo.replace(/^([^\/@]+)@([^:\/]+):([^\/]+)\/(.*)$/, (all, gitUser, host, user, repo) => {
        conf.repository = { type: "git", url: all };
        githubRepo(gitUser, host, 'git+ssh', user, repo, conf);
        done = true;
        return '';
    });
    if (done) { return; }
    repo.replace(/^(https|git|git+ssh|git+https):\/\/([^\/:]+)\/([^\/:]+)\/(.*)$/,
        (all, proto, host, user, repo) =>
    {
        conf.repository = { type: "git", url: all };
        if (proto === 'https') { proto = 'git+' + proto; }
        githubRepo(null, host, proto, user, repo, conf);
        done = true;
        return '';
    });
    if (done) { return; }
    conf.repository = { type: "git", url: repo };
};

// taken from semver.js
const SEMVER_MAX_LENGTH = 256;
const SEMVER_VALIDATOR = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][a-zA-Z0-9-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][a-zA-Z0-9-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const semverValid = (ver) => {
    return ver.length <= SEMVER_MAX_LENGTH && SEMVER_VALIDATOR.test(ver);
};

const init = (argv, done) => {
    console.log([
        "This utility will walk you through creating a package.json for",
        "a native ReasonML/OCaml esy project.",
        "",
        "See https://esy.sh/docs/en/configuration.html for esy specific",
        "extensions to the esy package.json format.",
        "",
        "Use `esyr install <pkg> --save` afterwards to install a package",
        "and save it as a dependency in the package.json file.",
        "",
        "Press ^C at any time to quit."
    ].join('\n'));
    const rl = Readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    const conf = {};
    conf.esyr = {};
    conf.esyr.extends =
        "https://raw.githubusercontent.com/cjdelisle/esyr/1.0.0/package-json-prototypes/default-reason.json";
    const QUESTIONS = [
        [ "name", process.cwd().split(Path.sep).pop(), (arg) => {
            if (!/^[a-zA-Z0-9_\-\.\~]+$/.test(arg)) {
                return "Sorry, name can only contain URL-friendly characters.";
            }
            conf.name = arg;
        }],
        [ "version", "1.0.0", (arg) => {
            if (!semverValid(arg)) { return "Invalid version"; }
            conf.version = arg;
        }],
        [ "description", null, (arg) => { conf.description = arg; }],
        [ "entry point", "Main.re", (arg) => {
            if (!/[a-zA-Z][a-zA-Z0-9_]*\.(ml|re)$/) {
                return "The name of the main entry point must begin with a letter and be\n" +
                    "alphanumeric with _ character and end with .ml or .re, subfolders are\n" +
                    "not yet supported.";
            }
            conf.main = arg;
        }],
        [ "git repository", null, (arg) => {
            if (!arg) { return; }
            repository(arg, conf);
        }],
        [ "keywords", null, (arg) => { if (arg) { conf.keywords = arg.split(' '); } }],
        [ "author", null, (arg) => { conf.author = arg; }],
        [ "license", "ISC", (arg) => {
            const its = validateLicense(arg);
            if (!its.validForNewPackages) {
                let errors = (its.errors || []).concat(its.warnings || [])
                return 'Sorry, ' + errors.join(' and ') + '.';
            }
            conf.license = arg;
        }]
    ];
    let nt = nThen;
    QUESTIONS.forEach((q) => {
        nt = nt((w) => {
            const again = () => {
                rl.question(q[0] + ':' + (q[1] ? ' (' + q[1] + ')' : ''), w((ans) => {
                    if (ans === '') { ans = q[1] || ''; }
                    const out = q[2](ans);
                    if (out) {
                        console.log(out);
                        again();
                    }
                }));
            };
            again();
        }).nThen;
    });
    nt((w) => {
        console.log('About to write to ' + process.cwd() + '/package.json:');
        console.log();
        console.log(JSON.stringify(conf, null, '  '));
        console.log();
        console.log();
        rl.question('Is this ok? (yes)', w((ans) => {
            rl.close();
            if (ans && ans.toLowerCase() !== 'yes') {
                console.log('Aborted');
                w.abort();
            }
        }));
    }).nThen((w) => {
        Fs.writeFile('package.json', JSON.stringify(conf, null, '  '), 'utf8', w((err) => {
            if (err) { throw err; }
        }));
    }).nThen((w) => {
        done();
    });
};

const noPkg = () => {
    error("No package.json file was found, try: esyr init");
};

const findRoot = (cb) => {
    let wrkdir = process.cwd().split(Path.sep);
    const look = (path) => {
        const joined = path.join(Path.sep);
        Fs.exists(joined + '/package.json', (exists) => {
            path.pop();
            if (exists) { return void cb(joined); }
            if (!path.length) { return void cb(); }
            look(path);
        });
    };
    look(wrkdir);
};

const newCache = () => {
    return {
        package_json: {}
    };
};

let cache;
const getCache = (cb) => {
    if (cache) { return void cb(null, cache); }
    Fs.readFile(HOME + '/.esyr/cache.json', 'utf8', (err, ret) => {
        if (ret) {
            debug("Got cache from file");
            cache = JSON.parse(ret);
            return void cb(null, cache);
        }
        if (err && err.code === 'ENOENT') {
            debug("Creating new cache");
            cache = newCache();
            return void cb(null, cache);
        }
        return void cb(err);
    });
};

const putCache = (cb) => {
    if (!cache) {
        debug("No cache");
        return void setTimeout(cb);
    }
    const warnIfErr = (w, x) => {
        return w((err) => {
            if (!err) { return; }
            error("Unable to save cache [" + x + "] esyr will be slower");
            w.abort();
            return void cb();
        });
    };
    debug("Storing cache to file");
    nThen((w) => {
        Fs.exists(HOME + '/.esyr', w((exists) => {
            if (exists) { return; }
            Fs.mkdir(HOME + '/.esyr', 0o777, warnIfErr(w, "mkdir"));
        }));
    }).nThen((w) => {
        Fs.writeFile(
            HOME + '/.esyr/_cache.json',
            JSON.stringify(cache, null, '  '),
            { encoding: 'utf8' },
            warnIfErr(w, "writeFile")
        );
    }).nThen((w) => {
        Fs.rename(
            HOME + '/.esyr/_cache.json',
            HOME + '/.esyr/cache.json',
            warnIfErr(w, "rename"));
    }).nThen((w) => {
        cb();
    });
};

const getGenericConf = (url, cb) => {
    let cache;
    debug("package.json extends " + url);
    nThen((w) => {
        getCache(w((err, ret) => {
            if (err) { w.abort(); return void cb(err); }
            cache = ret;
            if (cache && cache.package_json[url]) {
                w.abort();
                debug("found " + url + " in cache");
                return void cb(null, cache.package_json[url]);
            }
        }));
    }).nThen((w) => {
        const done = w();
        debug("downloading " + url);
        Https.get(url, (resp) => {
            let data = '';
            resp.on('data', (chunk) => { data += chunk; });
            resp.on('end', () => {
                done();
                let json;
                try {
                    json = JSON.parse(data);
                } catch (e) {
                    return void cb(new Error("Getting config [" + url +
                        "] content does not parse as JSON."));
                }
                cache.package_json[url] = json;
                debug("downloading " + url + " complete");
                cb(null, JSON.parse(JSON.stringify(json)));
            });
        }).on("error", (err) => {
            done();
            return void cb(err);
        });
    });
};

const readPkgJson = (cb) => {
    let conf;
    nThen((w) => {
        debug("Reading package.json file");
        Fs.readFile('./package.json', 'utf8', w((err, ret) => {
            if (!ret) { w.abort(); return void cb(err); }
            conf = JSON.parse(ret);
        }));
    }).nThen((w) => {
        if (!conf.esyr || !conf.esyr.extends) { return; }
        getGenericConf(conf.esyr.extends, w((err, ret) => {
            if (!ret) { w.abort(); return void cb(err); }
            delete conf.esyr.extends;
            conf = DeepExtend(ret, conf);
        }));
    }).nThen((w) => {
        cb(null, conf);
    });
};

const cleanup = (cb) => {
    nThen((w) => {
        Fs.exists('./_esyr_orig_package.json', w((exists) => {
            if (!exists) { return; }
            debug("Cleaning up package.json");
            Fs.rename('./_esyr_orig_package.json', './package.json', w((err) => {
                if (err) {
                    throw Error(
                        "Error: cleanup() Could not replace original package.json\n" +
                        err.message
                    );
                }
            }));
        }));
    }).nThen((w) => {
        cb();
    });
};

const switchPkgJson = (conf, cb) => {
    nThen((w) => {
        Fs.rename('./package.json', './_esyr_orig_package.json', w((err) => {
            if (err) {
                w.abort();
                throw Error("Error: Could not move package.json " + err.message);
            }
        }));
    }).nThen((w) => {
        const out = { __comment: "Generated by esyr, run `esyr clean` to revert to the original" };
        for (let x in conf) { out[x] = conf[x]; }
        Fs.writeFile(
            './package.json',
            JSON.stringify(out, null, '  '),
            { encoding: 'utf8' },
            w((err) => {
                if (!err) { return; }
                cleanup(() => {
                    throw new Error("Could not generate package.json file " + err.message);
                });
            })
        );
        cb();
    });
};

const mkIfNonexistant = (name, content, cb) => {
    let exists = false;
    nThen((w) => {
        Fs.exists(name, w((ex) => { exists = ex; }));
    }).nThen((w) => {
        if (!exists) { return; }
        Fs.readFile(name, 'utf8', w((err, ret) => {
            if (err) { throw err; }
            if (content.indexOf('$ESYR_CAN_REPLACE$') === -1) {
                w.abort();
                return void cb();
            }
        }));
    }).nThen((w) => {
        Fs.writeFile(name, content, "utf8", w((err) => {
            if (!err) { return; }
            throw err;
        }));
    }).nThen((w) => { cb(); });
};

const printSexp = (list) => {
    if (!Array.isArray(list)) { return list; }
    return '( ' + list.map(printSexp).join(' ') + ' )';
};

const binName = (conf) => {
    return conf.main.replace(/(\.re|\.ml)$/, '');
};

const binPath = (conf) => {
    return ((conf.esy && conf.esy.buildsInSource) ? conf.esy.buildsInSource : './_build') +
        '/default/' + binName(conf) + '.exe';
};

const mkDunes = (argv, conf, cb) => {
    let version = 0;
    if (argv.indexOf('--version') > -1) {
        version = Number(argv[argv.indexOf('--version') + 1]);
    }
    if (isNaN(version)) {
        throw new Error("Invalid version number in command " + argv.join(' '));
    }
    if (version > 0) {
        throw new Error("I don't know how to mkdunes version " + version +
            " prehaps try `npm i -g esyr` to upgrade");
    }
    nThen((w) => {
        mkIfNonexistant(conf.name + ".opam",
            "# Autogenerated by esyr $ESYR_CAN_REPLACE$\n", w());
            
        mkIfNonexistant("jbuild-ignore", [
            "# Autogenerated by esyr $ESYR_CAN_REPLACE$",
            ".git",
            "node_modules",
            ""
        ].join('\n'), w());
        mkIfNonexistant("jbuild", [
            ";; Autogenerated by esyr $ESYR_CAN_REPLACE$",
            printSexp(["jbuild_version", 1]),
            printSexp(["executable", [
                ["name", binName(conf)],
                ["public_name", conf.name],
                ["libraries", [  ] ]
            ]]),
            ""
        ].join('\n'), w());
    }).nThen((w) => {
        cb();
    });
};

const mvexe = (args, conf, cb) => {
    let dst = args[0];
    if (/[\.\/\\]/.test(dst)) { dst += binName(conf) + '.exe'; }
    Fs.rename(binPath(conf), dst, (err) => {
        if (err) { throw err; }
        cb();
    });
};

const doEsyrOps = (ops, conf, cb) => {
    let nt = nThen;
    ops.forEach((op) => {
        nt = nt((w) => {
            switch (op[0]) {
                case 'esyr': switch (op[1]) {
                    case 'mkdunes': return void mkDunes(op.slice(2), conf, w());
                    case 'mvexe': return void mvexe(op.slice(2), conf, w());
                    default: break;
                } break;
                default: break;
            }
            warn("no operation for " + op);
        }).nThen;
    });
    nt(() => { cb(); });
};

const esy = (argv, cb) => {
    const proc = Child.spawn(ESY_PATH, argv, {
        stdio: [ process.stdin, process.stdout, process.stderr ]
    });
    proc.on('close', cb);
};

const usage = () => {
    console.log([
        "Usage: esyr <command>",
        "",
        "where command is one of:",
        "    init             # npm init-like, creates an empty package.json file",
        "    esy              # direct invocaton of esy, no package.json overlay",
        "    clean            # clean up files which were generated by esyr",
        "    mkdunes          # generate files for dune/jbuilder (you shouldn't need this directly)",
        "    gitignore        # propose possible content of a .gitignore file",
        "    install          # run `esy install` with overlayed package.json",
        "    build            # run `esy build` with overlayed package.json",
        "    help             # this menu, for `esy help` use `esyr esy help`",
        "    <anything else>  # run esy with the same commands with overlayed package.json",
        "",
        "For more information see: https://github.com/cjdelisle/esyr#readme"
    ].join('\n'));
};

const main = (argv) => {
    if (argv[1].endsWith('.js') || argv[1].endsWith(Path.sep + 'esyr')) { argv.shift(); }
    argv.shift();
    if (!argv.length || argv[0] === 'help') { return void usage(); }
    if (argv[0] === 'init') { return void init(argv, ()=>{}); }
    if (argv[0] === 'esy') { return void esy(argv, ()=>{}); }

    let conf;
    nThen((w) => {
        findRoot(w((r) => {
            if (!r) { w.abort(); return void noPkg(); }
            process.chdir(r);
            debug("Found project root:", r);
        }));
    }).nThen((w) => {
        if (argv[0] === 'clean') {
            cleanup(w());
            w.abort();
        }
    }).nThen((w) => {
        readPkgJson(w((err, ret) => {
            if (!ret) { throw err; }
            conf = ret;
        }));
    }).nThen((w) => {
        if (!conf) { throw new Error("package.json is apparently empty"); }
        if (!conf.name) {
            error("package.json must have a 'name' entry");
        } else if (!conf.main) {
            error("package.json must have a 'main' entry");
        } else if (!/^[A-Za-z0-9_]+(\.re|\.ml)$/.test(conf.main)) {
            error("package.json main file (" + conf.main +
                ") must only have the alphanumeric characters in the name and " +
                "end with .ml or .re");
        } else {
            Fs.exists(conf.main, w((exists) => {
                if (exists) { return; }
                error("package.json main file (" + conf.main + ") does not exist");
                w.abort();
            }));
            return;
        }
        w.abort();
    }).nThen((w) => {
        if (!conf.description) {
            warn("No description");
        } else if (!conf.repository) {
            warn("No repository field.");
        } else if (!conf.license) {
            warn("No license field.");
        }

        putCache(w());
        if (argv[0] === 'mkdunes') {
            mkDunes(argv, conf, w());
            w.abort();
        }
    }).nThen((w) => {
        if (argv[0] === 'gitignore') {
            const out = [
                'node_modules',
                'jbuild',
                'jbuild-ignore',
                '.merlin',
                conf.name + '.opam',
                conf.name + '.install'
            ];
            if (conf.esy && conf.esy.buildsInSource) {
                out.push(conf.esy.buildsInSource);
            } else {
                out.push('_build');
            }
            out.push(binName(conf) + '.exe');
            console.log(out.join('\n'));
            w.abort();
        }
    }).nThen((w) => {
        if (!(conf.esyr && conf.esyr[argv[0]])) { return; }
        let list = conf.esyr[argv[0]];
        if (list.indexOf('esy') > -1) { list = list.slice(0, list.indexOf('esy')); }
        doEsyrOps(list, conf, w());
    }).nThen((w) => {
        switchPkgJson(conf, w());
    }).nThen((w) => {
        esy(argv, w());
    }).nThen((w) => {
        cleanup(w());
    }).nThen((w) => {
        if (!(conf.esyr && conf.esyr[argv[0]])) { return; }
        let list = conf.esyr[argv[0]];
        if (list.indexOf('esy') === -1) { return; }
        list = list.slice(list.indexOf('esy') + 1);
        doEsyrOps(list, conf, w());
    });
};
if (!module.parent) {
    main(process.argv);
}