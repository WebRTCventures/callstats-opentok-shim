module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    babel: {
      options: {
        sourceMap: true,
        presets: ['env']
      },
      dist: {
        files: [{
          expand: true,
          src: 'callstats-opentok-shim.js',
          dest: 'dist',
          ext: '-es5.js'
        }]
      }
    },
    uglify: {
      options : {
        banner: '/*! <%= pkg.name %>  version = <%= pkg.version %> <%= grunt.template.today("yyyy-mm-dd hh-MM-ss") %> */\n',
        sourceMap : true,
        mangle: true, // prevents changes to your variable and function names
        drop_console: true, // elimates all the calls to console.* methods
        beautify: false, // beautify your code for debugging purposes
      },
      all_src : {
        src : 'dist/*-es5.js',
        dest : 'dist/callstats-opentok-shim.min.js'
      }
    }
  });

  grunt.loadNpmTasks('grunt-babel');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.registerTask('default', ['babel', 'uglify']);

};
