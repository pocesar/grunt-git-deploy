/*
 * grunt-git-deploy
 * https://github.com/iclanzan/grunt-git-deploy
 *
 * Copyright (c) 2013 Sorin Iclanzan
 * Licensed under the MIT license.
 */

'use strict';

var path = require("path");

module.exports = function(grunt) {
  var
    file = grunt.file;

  grunt.registerMultiTask('git_deploy', 'Push files to a git remote.', function() {
    // Merge task options with these defaults.

    var options = this.options({
      message: 'git deploy',
      localBranch: 'master',
      remoteBranch: 'master',
      noOrphan: false,
      noPrune: false,
      ignore: ['.gitignore','Gruntfile.js','node_modules','nbproject','README.md','test','**/*.scss','**/*.sass','.sass-cache','.idea','.DS_Store','config.rb'],
      ignoreAppend: false,
      quiet: true,
      buildIgnore: true,
      pretend: false,
      keepDest: false,
      url: process.env.GIT_DEPLOY_URL
    });

    if (!options.url){
      grunt.fail.warn('The URL to a remote git repository is required to be set in config or as process.env.GIT_DEPLOY_URL');
      return false;
    }

    var
      files = this.files[0],
      cwd = process.cwd(),
      src = path.join(cwd, files.src[0]),
      dotgit = path.join(src, '.git'),
      where = src,
      isWorkingCopy = file.isDir(dotgit),
      dest = false;

    if (!file.isDir(src)) {
      grunt.fail.warn('A "src" directory is needed.');
      return false;
    }

    if ((!files.dest || !files.dest.length) && isWorkingCopy) {
      grunt.log.warn('No "dest" defined, would DESTROY this current working copy');
      return false;
    }

    if (files.dest) {
      dest = path.join(cwd, files.dest);

      grunt.verbose.ok('Using', dest.cyan,'as temp folder');
    }

    function git(args, where) {
      return function(cb) {
        if (!args.length) {
          return cb();
        }
        if (!options.pretend) {
          grunt.log.ok('Running git', args.join(' ').green);
          grunt.util.spawn({
            cmd: 'git',
            args: args,
            opts: {
              env: process.env,
              cwd: where || cwd,
              stdio: options.quiet ? 'ignore' : 'inherit'
            }
          }, function(err, result){
            if (options.quiet === false) {
              if (err) {
                grunt.log.error(err);
              } else if (result && (result.stderr || result.stdout)) {
                grunt.log.ok(result.stderr || result.stdout);
              }
            }
            cb(err);
          });
        } else {
          grunt.log.ok('Would run', 'git'.blue, args.join(' ').green);
          cb();
        }
      };
    }

    function buildIgnore() {
      return function(cb) {
        if (!options.buildIgnore) {
          grunt.log.ok('Skipping creation of', '.gitignore'.cyan);
          cb();
          return;
        }

        grunt.log.ok('Creating', '.gitignore'.cyan);

        var
          gitignore = path.join(src, '.gitignore'),
          append = '';

        if (options.ignoreAppend) {
          if (file.isFile(gitignore)) {
            append = file.read(gitignore);
            append += append.charAt(append.length-1) !== '\n' ? '\n' : '';
          }
        }

        var ignore = [], negations = [];

        options.ignore.forEach(function(p){
          if (p.charAt(0) === '!'){
            file.expand({cwd: src}, [p.slice(1)]).forEach(function(s){
              negations.push('!' + s);
            });
          } else {
            ignore.push(p);
          }
        });

        append = append + (file.expand({
              cwd: src,
              filter: function(p){
                return p.indexOf(dest) === -1;
              }
            }, ignore).concat(negations).join('\n'));

        if (!options.pretend) {
          file.write(
            path.join(where, '.gitignore'),
            append
          );
        } else {
          grunt.log.ok('Would write', (path.join(where, '.gitignore').cyan), 'file with contents:');
          grunt.log.writeln(append);
        }

        cb();
      };
    }

    function removeDotGit(){
      return function(cb){
        if (file.isDir(dotgit)) {
          if (!options.keepDest) {
            if (!options.pretend) {
              grunt.log.ok('Removing', dotgit.cyan);
              grunt.file.delete(dotgit);
            } else {
              grunt.log.ok('Would remove', dotgit.cyan, 'folder');
            }
          }
        }
        cb();
      };
    }

    function cleanup(){
      return function(cb){
        if (isWorkingCopy) {
          if (!options.keepDest) {
            if (!options.pretend) {
              grunt.log.ok('Removing', dest.cyan);
              grunt.file.delete(dest);
            } else {
              grunt.log.ok('Would remove "dest" folder', where.cyan);
            }
          }
        }
        cb();
      };
    }

    var done = this.async(), cmds = [];

    if (isWorkingCopy) {
      if (options.keepDest && file.isDir(dest)) {
        cmds.push(git(['fetch', '--force', dotgit], dest));
      } else {
        cmds.push(git(['clone', '--local', dotgit, dest]));
      }
    }

    if (dest) {
      dotgit = path.join(dest, '.git');
      where = dest;
    }

    grunt.util.async.series(cmds.concat([
      removeDotGit(),
      git(options.noOrphan ? [] : ['init'], where),
      buildIgnore(),
      git(options.keepDest && file.isDir(where) ?
        ['merge','FETCH_HEAD'] :
        ['checkout'].concat(options.noOrphan === true ? [] : ['--orphan']).concat([options.localBranch]), where),
      git(['add', '--all'], where),
      git(options.keepDest && file.isDir(where) ?
        [] :
        ['commit', '--message="' + options.message + '"'], where),
      git(
        ['push']
          .concat(options.noPrune === true ? [] : ['--prune'])
          .concat(['--force']).concat(options.quiet ? ['--quiet'] : [])
          .concat([options.url, options.localBranch + ':' + options.remoteBranch]), where),
      removeDotGit(),
      cleanup()
    ]), function(err, results){
      done(err);
    });

  });
};

