module.exports = function(grunt) {

  grunt.initConfig({
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
        sourceMap : true
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