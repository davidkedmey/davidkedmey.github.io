/* ip-core.js — InteractivePaper orchestrator
   Must be loaded BEFORE other ip-*.js modules.

   Usage:
     InteractivePaper.init({
       id: 'constructor-theory-2012',
       title: 'Philosophy of Constructor Theory',
       readingModes: { default: 'enhanced' },
       paragraphIndex: { data: PARA_INDEX, summaryTiers: false, picker: true }
     });

   Then load ip-reading-modes.js, ip-paragraph-index.js, etc.
   Each module reads its config from InteractivePaper._config.
*/

window.InteractivePaper = window.InteractivePaper || {};

window.InteractivePaper.init = function (config) {
  window.InteractivePaper._config = config || {};
};
