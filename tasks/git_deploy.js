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
    file = grunt.file,
    spawn = grunt.util.spawn;

  grunt.registerMultiTask('git_deploy', 'Push files to a git remote.', function() {
    // Merge task options with these defaults.
    var options = this.options({
      message: 'git deploy',
      localBranch: 'master',
      remoteBranch: 'master',
      ignore: ['.gitignore','Gruntfile.js','node_modules','nbproject','README.md','test','**/*.scss','**/*.sass','.sass-cache','.idea','.DS_Store','config.rb'],
      ignoreAppend: false,
      quiet: true
    });

    if (!options.url) {
      grunt.fail.warn('The URL to a remote git repository is required.');
      return false;
    }

    var src = this.filesSrc[0];

    if (!file.isDir(src)) {
      grunt.fail.warn('A source directory is needed.');
      return false;
    }

    function git(args) {
      return function(cb) {
        grunt.log.writeln('\n>> '.cyan + 'Running git ' + args.join(' ').green + '\n');
        spawn({
          cmd: 'git',
          args: args,
          opts: {cwd: src}
        }, function(err, result){
          if (options.quiet === false) {
            if (err) {
              grunt.log.error(err);
            } else if (result && (result.stderr || result.stdout)) {
              grunt.log.writeln(result.stderr || result.stdout);
            }
          }
          cb(err, '');
        });
      };
    }

    function buildIgnore() {
      return function(cb) {
        grunt.log.writeln('\n>> '.cyan + 'Creating ' + '.gitignore'.cyan + '\n');

        var
          gitignore = path.join(src, '.gitignore'),
          append = '';

        if (options.ignoreAppend) {
          if (file.isFile(gitignore)) {
            append = file.read(gitignore);
            append += append.charAt(append.length-1) !== '\n' ? '\n' : '';
          }
        }

        file.write(
          gitignore,
          append + (file.expand({
            cwd: src
          }, options.ignore).join('\n'))
        );

        cb(null, '', 0);
      };
    }

    var dotgit = path.join(src, '.git');

    if (file.isDir(dotgit)) {
      grunt.file.delete(dotgit);
    }

    var done = this.async();

    grunt.util.async.series([
      git(['init']),
      buildIgnore(),
      git(['checkout', '--orphan', options.localBranch]),
      git(['add', '--all']),
      git(['commit', '--message="' + options.message + '"']),
      git(['push', '--prune', '--force'].concat(options.quiet ? ['--quiet'] : []).concat([options.url, options.localBranch + ':' + options.remoteBranch]))
    ], done);

  });
};

