# Esyr - An esy overlay

This tool is meant to add some of the features from npm which are currently
missing from esy and as an experimentation platform for helping evolve esy to be..
well... esyr :)

## See it work

You need to have node and npm installed but you don't need anything else.

```bash
$ npm install -g esyr
$ mkdir first-reason-project
$ cd first-reason-project
$ esyr init  ## follow the instructions to make a package.json file
$ echo 'print_endline("Hello ReasonML!");' > ./Main.re
$ esyr install
$ esyr build
$ ./Main.exe
```

Congratulations, you just made a reasonml project. You'll notice a lot of files
were created, esyr can propose to you a possible `.gitignore` file which will
ignore them.

```bash
$ esyr gitignore > ./.gitignore
```

## Details and how it works

[Esy](https://esy.sh/) is a npm-like build tool for building ReasonML/OCaml projects.
It's main job is to download the dependencies and make them available for jbuilder/dune
which then does the actual building.

This means:
1. Lots of stuff in the package.json file which is necessary just to build hello world.
2. Lots of files which contain duplicated things such as the project name, because it
needs to be known by jbuilder/dune as well as by esy.

Esyr solves these the first problem by allowing the package.json file to **extend** a
prototype package.json. By default, new esyr projects will extend [default-reason.json](https://github.com/cjdelisle/esyr/blob/master/package-json-prototypes/default-reason.json)

The second problem is solved by a new feature added to esyr called `esyr mkdunes`, this
reads the package.json file and generates the relevant dune/jbuilder files, importantly
every file contains a special key `$ESYR_CAN_REPLACE$` so that esyr knows it generated
the file. Therefore if you want to customize one of the generated files and you don't
want it being overwritten, or you would like to have more control over the build entirely,
simply remove these keys and the files will not be overwritten.

## What's in this package.json prototype file ?

You just made a fresh ReasonML project and you want to know what is in this package.json
file that you are extending, here is a deeper explanation, starting from the top:

* `esy`: This is a block which controls how esy will build the project, you can learn
more about how esy handles package.json files in
[Esy Project Configuration](https://esy.sh/docs/en/configuration.html).
* `esyr`: This block controls esyr
  * `extends`: This is not in the prototype but it is in your package.json file made
  be `esyr init`. This is a URL of the file which esyr should use as the prototype for
  your esyr project. You can remove this but then you'll need to add all of the other
  things in the prototype file to your package.json.
  * `build`: This controls the build process, it adds a `mkdunes` command which generates
  the dune/jsbuilder files and it adds a `mvexe` command which moves the final executable
  file into the root directory, while not strictly necessary, it makes for a nicer
  experience. The result of this is that esyr will invoke:
    1. `esyr mkdunes --version 0`
    2. `esy build`
    3. `esyr mvexe ./`
  You can remove the build block but you will not get the `mkdunes` or `mvexe` calls,
  so you will need to manage your dune/jbuild files yourself and you will find the
  resulting executable in `./_build/default/Main.exe` (default location).
* `dependencies`: These are dependencies which are necessary to build the project, they
are processed and downloaded by esy, not esyr nor npm.
  * `@esy-ocaml/esy-installer`: This is an internal part of esy which is used
  for accessing opam, in future versions of esy it will nolonger be necessary for
  projects to require it.
  * `@opam/dune`: This is the jbuilder/dune project which esy uses to perform the build.
  * `@esy-ocaml/reason`: This is the ReasonML Frontend for OCaml, this is the parser which
  parses Reason code into the OCaml AST, there is a nice
  [diagram of the OCaml toolchain](https://github.com/esy-ocaml/reason/tree/3.0.0/src#repo-walkthrough)
  showing where the Reason frontend fits in.
  * `refmterr`: This is an error pretty-printer, you can see it is also present
  in the `esy.build` block, it interprets error messages and makes them a lot
  more user friendly.
* `peerDependencies`: This is here because it is not possible for projects requiring
different versions of ocaml to co-exist.
* `devDependencies`:
  * `@esy-ocaml/merlin`: This adds [merlin](https://github.com/ocaml/merlin)
  auto-completion for Vim and Emacs, you can access it by invoking vim or emacs
  through the esy shell, for example: `esyr vim ./Main.re`. This is here by accident
  and will be removed in the next version of `default-reason.jspn`.
  * `ocaml`: It seems kind of obvious that an OCaml project needs OCaml, but
  because esy is based on npm, the dependency needs to be made clear. By
  declaring it both in `devDependencies` and `peerDependencies`, any build which
  requires multiple incompatible versions of OCaml will fail, which is good
  because there is no way that projects with incompatible versions of OCaml can
  ever link with one another.

## Commands

* `esyr`
  * `init`: Provide an npm-like walkthrough to create a new esyr-compatible
  package.json file.
  * `esy`: invoke esy without any package.json extension (probably not what you want)
  * `clean`: because esyr works by swapping files, sometimes a file is leftover which
  should not be there. Cleanup if there is a stray _esyr_orig_package.json file. This
  is equivilent to `mv _esyr_orig_package.json package.json`.
  * `mkdunes`: Create the following files from what is known from the package.json,
  this command takes an argument `--version=<number>`, it is highly recommended that
  you always specify the number because the format will change.
    * `<project name>.opam`
    * `jbuild-ignore`
    * `jbuild`
  * `gitignore`: Propose a possible `.gitignore` file which excludes all of the files
  files that are created by esyr and esy. This is written to stdout so you can do
  `esyr gitignore > ./.gitignore`
  * `install`: Run `esy install` but with extra hooks.
  * `build`: Run `esy build` but with extra hooks.
  * `help`: print a brief help notice
  * `<anything>`: Swap the package.json file for the one with the extended prototype
  merged, then invoke esy with the swapped package.json file, then swap it back.

## Status

This is currently experimental, use at your own risk and remember that you might
need to do some migrations in future versions.

### TODO

* [] `esyr install --save` not supported yet (also need to add dependencies to jbuild file)
* [] `esyr clean` ought to also clean up the _build directory and the generated dune
files.
* [] Stop swapping `package.json` files, it's the source of plenty of bugs.
  * Solution 1: esy supports extends
  * Solution 2: `esyr.json` file, allowing package.json to be generated (like a dune file).
* [] Support building OCaml projects
* [] Support building libraries
