/*
 * grunt-git-deploy
 * https://github.com/iclanzan/grunt-git-deploy
 *
 * Copyright (c) 2013 Sorin Iclanzan
 * Licensed under the MIT license.
 */

'use strict';

var
  path = require('path'),
  q = require('bluebird');

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
      noForce: false,
      incremental: false,
      ignore: [
        '.gitignore',
        'Gruntfile.js',
        'node_modules',
        'nbproject',
        'README.md',
        'test',
        '**/*.scss',
        '**/*.sass',
        '.sass-cache',
        '.idea',
        '.DS_Store',
        'config.rb'
      ],
      ignoreAppend: false,
      quiet: true,
      buildIgnore: true,
      pretend: false,
      forceAdd: [],
      url: process.env.GIT_DEPLOY_URL
    }), done = this.async();

    if (!options.url){
      grunt.fail.warn('The URL to a remote git repository is required to be set in config or as process.env.GIT_DEPLOY_URL');
      return done(false);
    }

    var
      files = this.files[0],
      cwd = process.cwd(),
      src = path.join(cwd, files.src[0]),
      srcgit = path.join(src, '.git'),
      destgit = false,
      isWorkingCopy = file.isDir(srcgit),
      dest = false;

    if (!file.isDir(src)) {
      grunt.fail.warn('A "src" directory is explicitly needed.');
      return done(false);
    }

    if ((!files.dest || !files.dest.length) && isWorkingCopy) {
      grunt.log.warn('No "dest" defined, would DESTROY this current working copy');
      return done(false);
    }

    dest = path.join(cwd, files.dest);
    destgit = path.join(dest, '.git');

    grunt.log.ok('Using', dest.cyan, 'as temp folder');
    grunt.log.ok('Source git', srcgit);
    grunt.log.ok('Destination git', destgit);

    function git(args, foldercwd, anyway) {
      anyway = anyway || false;

      return new q(function(resolve, reject){
        if (!args.length) {
          return resolve();
        }

        if (options.pretend) {
          args.push('--dry-run');
        }

        grunt.log.ok('Running git', args.join(' ').green);
        grunt.util.spawn({
          cmd: 'git',
          args: args,
          opts: {
            env: process.env,
            cwd: foldercwd || cwd,
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

          if (!anyway) {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          } else {
            resolve();
          }
        });
      });
    }

    function buildIgnore() {
      return new q(function(resolve) {
        if (!options.buildIgnore) {
          grunt.log.ok('Skipping creation of', '.gitignore'.cyan);
          return resolve();
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
            path.join(dest, '.gitignore'),
            append
          );
        } else {
          grunt.log.ok('Would write', (path.join(dest, '.gitignore').cyan), 'file with contents:');
          grunt.log.writeln(append);
        }

        resolve();
      });
    }

    function removeDotGit(){
      return new q(function(resolve){
        if (file.isDir(destgit)) {
          if (!options.incremental) {
            if (!options.pretend) {
              grunt.log.ok('Removing', destgit.cyan);
              grunt.file.delete(destgit);
            } else {
              grunt.log.ok('Would remove', destgit.cyan, 'folder');
            }
          }
        }
        resolve();
      });
    }

    function forceAdd() {
      return new q(function(resolve, reject) {
        if (options.forceAdd.length) {
          var files = [], adds = q.resolve(), bases = {};

          files = file.expand({
            cwd: src
          }, options.forceAdd);

          files.forEach(function(file) {
            var isDir = grunt.file.isDir(file);
            if (isDir) {
              if (typeof bases[file] === 'undefined') {
                bases[file] = 1;
                for (var base in bases) {
                  if (base.indexOf(file) !== 0 && base.length < file.length) {
                    delete bases[file];
                  }
                }
              }
            }

            if (!isDir) {
              if (options.pretend) {
                grunt.log.ok('Would copy ' + path.resolve(file).cyan + ' to ' + path.join(dest, file).green);
              } else {
                grunt.file.copy(path.resolve(file), path.join(dest, file));
              }
            }
          });

          for (var base in bases) {
            adds = adds.then(function(){
              return git(['add','--force', base], dest);
            });
          }

          adds.then(resolve, reject);
        } else {
          resolve();
        }
      });
    }

    function cleanup(){
      return new q(function(resolve){
        if (isWorkingCopy) {
          if (!options.incremental) {
            if (!options.pretend) {
              grunt.log.ok('Removing', dest.cyan);
              grunt.file.delete(dest);
            } else {
              grunt.log.ok('Would remove "dest" folder', dest.cyan);
            }
          }
        }
        resolve();
      });
    }

    function gitPull() {
      return git(['fetch', '--force', srcgit], dest)
      .then(function(){
        return git(['merge', 'FETCH_HEAD', '--strategy=resolve', '--no-commit'], dest);
      })
      .then(function(){
        return git(['rm','-r','--cached','.'], dest);
      });
    }

    function initGit(){
      return new q(function(resolve, reject){
        var cmds = q.resolve();

        grunt.log.ok('Destination is', dest.cyan);

        if (options.incremental) {
          if (!file.isDir(dest)) {
            if (!options.pretend) {
              grunt.file.mkdir(dest);
            } else {
              grunt.log.ok('Would create folder', dest.cyan);
            }
          }

          if (!file.isDir(destgit)) {
            cmds = cmds.then(function() {
              return git(['clone', options.url, '--branch', options.remoteBranch, dest]);
            }).then(gitPull);
          } else {
            cmds = cmds.then(gitPull);
          }
        } else if (!file.isDir(dest)) {
          cmds = cmds.then(function(){
            return git(['clone', '--local', srcgit, '--branch', options.remoteBranch, dest]);
          });
        } else {
          cmds = cmds.then(function(){
            return git(['pull', '--force', srcgit], dest);
          });
        }

        cmds.then(resolve, reject);
      });
    }

    function gitPush() {
      return new q(function(resolve, reject){
        var cmds = ['push'];

        if (!options.noPrune) {
          cmds.push('--prune');
        }

        if (!options.noForce) {
          cmds.push('--force');
        }

        if (options.quiet) {
          cmds.push('--quiet');
        }

        git(cmds.concat([options.url, options.localBranch + ':' + options.remoteBranch]), dest).then(resolve, reject);
      });
    }

    initGit()
    .then(buildIgnore)
    .then(forceAdd)
    .then(function(){
      return git(['add', '--all'], dest);
    })
    .then(function(){
      return git(['commit', '--message="' + options.message + '"'], dest, true);
    })
    .then(gitPush)
    .then(removeDotGit)
    .then(cleanup)
    .done(function(){
      done();
    }, function(err){
      done(err);
    });
  });
};

