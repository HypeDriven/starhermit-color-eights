/* Color Eights — Graphics settings section (Settings → Graphics tab) with its own localized strings.
 * The rest of the game is English-only; this panel follows navigator.language. */
(function (global) {
  'use strict';

  const G = global.CEGfx;

  const EN_US = {
    general: 'General', graphics: 'Graphics', quality: 'Quality', auto: 'Auto (detected: {tier})',
    p_low: 'Low', p_balanced: 'Balanced', p_high: 'High', p_ultra: 'Ultra',
    renderScale: 'Render scale', fromPreset: 'From preset ({tier})',
    c_shadows: 'Shadows', c_ao: 'Ambient occlusion', c_bloom: 'Bloom', c_grade: 'Color grade',
    c_antialias: 'Anti-aliasing', c_reflections: 'Reflections', c_detail: 'Surface detail',
    c_particles: 'Dust particles', c_background: 'Ambient motion',
    t_off: 'Off', t_on: 'On', t_low: 'Low', t_medium: 'Medium', t_high: 'High', t_fxaa: 'FXAA', t_smaa: 'SMAA', t_msaa: 'MSAA',
    t_plain: 'Plain', t_detailed: 'Detailed', t_static: 'Static', t_animated: 'Animated',
    adaptive: 'Adaptive resolution', showFps: 'Show frame rate',
    postUnavailable: 'Post-processing is unavailable on this device, so the game renders without it.',
    unknownGpu: 'unknown GPU',
    w_noShadows: 'no shadows', w_shadows: '{n}² shadows', w_ao: 'ambient occlusion', w_aoHigh: 'full ambient occlusion',
    w_bloom: 'bloom', w_reflections: 'reflections', w_particles: 'particles', w_noAA: 'no anti-aliasing',
  };
  const EN_GB = Object.assign({}, EN_US, { c_grade: 'Colour grade' });
  const ES_419 = {
    general: 'General', graphics: 'Gráficos', quality: 'Calidad', auto: 'Automática (detectada: {tier})',
    p_low: 'Baja', p_balanced: 'Equilibrada', p_high: 'Alta', p_ultra: 'Ultra',
    renderScale: 'Escala de renderizado', fromPreset: 'Del ajuste predefinido ({tier})',
    c_shadows: 'Sombras', c_ao: 'Oclusión ambiental', c_bloom: 'Resplandor', c_grade: 'Corrección de color',
    c_antialias: 'Suavizado de bordes', c_reflections: 'Reflejos', c_detail: 'Detalle de superficies',
    c_particles: 'Partículas de polvo', c_background: 'Movimiento ambiental',
    t_off: 'Desactivado', t_on: 'Activado', t_low: 'Bajo', t_medium: 'Medio', t_high: 'Alto', t_fxaa: 'FXAA', t_smaa: 'SMAA', t_msaa: 'MSAA',
    t_plain: 'Simple', t_detailed: 'Detallado', t_static: 'Estático', t_animated: 'Animado',
    adaptive: 'Resolución adaptativa', showFps: 'Mostrar cuadros por segundo',
    postUnavailable: 'El posprocesado no está disponible en este dispositivo, así que el juego se muestra sin él.',
    unknownGpu: 'GPU desconocida',
    w_noShadows: 'sin sombras', w_shadows: 'sombras de {n}²', w_ao: 'oclusión ambiental', w_aoHigh: 'oclusión ambiental completa',
    w_bloom: 'resplandor', w_reflections: 'reflejos', w_particles: 'partículas', w_noAA: 'sin suavizado',
  };
  const ES_ES = Object.assign({}, ES_419, { showFps: 'Mostrar fotogramas por segundo' });
  const DE = {
    general: 'Allgemein', graphics: 'Grafik', quality: 'Qualität', auto: 'Automatisch (erkannt: {tier})',
    p_low: 'Niedrig', p_balanced: 'Ausgewogen', p_high: 'Hoch', p_ultra: 'Ultra',
    renderScale: 'Renderskalierung', fromPreset: 'Aus Voreinstellung ({tier})',
    c_shadows: 'Schatten', c_ao: 'Umgebungsverdeckung', c_bloom: 'Leuchteffekt', c_grade: 'Farbkorrektur',
    c_antialias: 'Kantenglättung', c_reflections: 'Spiegelungen', c_detail: 'Oberflächendetails',
    c_particles: 'Staubpartikel', c_background: 'Umgebungsbewegung',
    t_off: 'Aus', t_on: 'An', t_low: 'Niedrig', t_medium: 'Mittel', t_high: 'Hoch', t_fxaa: 'FXAA', t_smaa: 'SMAA', t_msaa: 'MSAA',
    t_plain: 'Schlicht', t_detailed: 'Detailliert', t_static: 'Statisch', t_animated: 'Animiert',
    adaptive: 'Adaptive Auflösung', showFps: 'Bildrate anzeigen',
    postUnavailable: 'Nachbearbeitung ist auf diesem Gerät nicht verfügbar, daher wird ohne sie gerendert.',
    unknownGpu: 'unbekannte GPU',
    w_noShadows: 'keine Schatten', w_shadows: '{n}²-Schatten', w_ao: 'Umgebungsverdeckung', w_aoHigh: 'volle Umgebungsverdeckung',
    w_bloom: 'Leuchteffekt', w_reflections: 'Spiegelungen', w_particles: 'Partikel', w_noAA: 'keine Kantenglättung',
  };
  const FR_FR = {
    general: 'Général', graphics: 'Graphismes', quality: 'Qualité', auto: 'Auto (détectée : {tier})',
    p_low: 'Basse', p_balanced: 'Équilibrée', p_high: 'Haute', p_ultra: 'Ultra',
    renderScale: 'Échelle de rendu', fromPreset: 'Selon le préréglage ({tier})',
    c_shadows: 'Ombres', c_ao: 'Occlusion ambiante', c_bloom: 'Halo lumineux', c_grade: 'Étalonnage des couleurs',
    c_antialias: 'Anticrénelage', c_reflections: 'Reflets', c_detail: 'Détail des surfaces',
    c_particles: 'Particules de poussière', c_background: 'Mouvement ambiant',
    t_off: 'Désactivé', t_on: 'Activé', t_low: 'Bas', t_medium: 'Moyen', t_high: 'Élevé', t_fxaa: 'FXAA', t_smaa: 'SMAA', t_msaa: 'MSAA',
    t_plain: 'Simple', t_detailed: 'Détaillé', t_static: 'Statique', t_animated: 'Animé',
    adaptive: 'Résolution adaptative', showFps: 'Afficher la fréquence d’images',
    postUnavailable: 'Le post-traitement n’est pas disponible sur cet appareil ; le jeu s’affiche sans lui.',
    unknownGpu: 'GPU inconnu',
    w_noShadows: 'sans ombres', w_shadows: 'ombres {n}²', w_ao: 'occlusion ambiante', w_aoHigh: 'occlusion ambiante complète',
    w_bloom: 'halo lumineux', w_reflections: 'reflets', w_particles: 'particules', w_noAA: 'sans anticrénelage',
  };
  const FR_CA = Object.assign({}, FR_FR, { graphics: 'Graphiques', showFps: 'Afficher le nombre d’images par seconde' });
  const PT_BR = {
    general: 'Geral', graphics: 'Gráficos', quality: 'Qualidade', auto: 'Automática (detectada: {tier})',
    p_low: 'Baixa', p_balanced: 'Equilibrada', p_high: 'Alta', p_ultra: 'Ultra',
    renderScale: 'Escala de renderização', fromPreset: 'Da predefinição ({tier})',
    c_shadows: 'Sombras', c_ao: 'Oclusão de ambiente', c_bloom: 'Brilho', c_grade: 'Correção de cor',
    c_antialias: 'Antisserrilhamento', c_reflections: 'Reflexos', c_detail: 'Detalhe das superfícies',
    c_particles: 'Partículas de poeira', c_background: 'Movimento ambiente',
    t_off: 'Desligado', t_on: 'Ligado', t_low: 'Baixo', t_medium: 'Médio', t_high: 'Alto', t_fxaa: 'FXAA', t_smaa: 'SMAA', t_msaa: 'MSAA',
    t_plain: 'Simples', t_detailed: 'Detalhado', t_static: 'Estático', t_animated: 'Animado',
    adaptive: 'Resolução adaptativa', showFps: 'Mostrar taxa de quadros',
    postUnavailable: 'O pós-processamento não está disponível neste dispositivo, então o jogo é exibido sem ele.',
    unknownGpu: 'GPU desconhecida',
    w_noShadows: 'sem sombras', w_shadows: 'sombras {n}²', w_ao: 'oclusão de ambiente', w_aoHigh: 'oclusão de ambiente completa',
    w_bloom: 'brilho', w_reflections: 'reflexos', w_particles: 'partículas', w_noAA: 'sem antisserrilhamento',
  };
  const IT = {
    general: 'Generale', graphics: 'Grafica', quality: 'Qualità', auto: 'Automatica (rilevata: {tier})',
    p_low: 'Bassa', p_balanced: 'Bilanciata', p_high: 'Alta', p_ultra: 'Ultra',
    renderScale: 'Scala di rendering', fromPreset: 'Dal preset ({tier})',
    c_shadows: 'Ombre', c_ao: 'Occlusione ambientale', c_bloom: 'Bagliore', c_grade: 'Correzione colore',
    c_antialias: 'Anti-aliasing', c_reflections: 'Riflessi', c_detail: 'Dettaglio superfici',
    c_particles: 'Particelle di polvere', c_background: 'Movimento ambientale',
    t_off: 'Disattivato', t_on: 'Attivato', t_low: 'Basso', t_medium: 'Medio', t_high: 'Alto', t_fxaa: 'FXAA', t_smaa: 'SMAA', t_msaa: 'MSAA',
    t_plain: 'Semplice', t_detailed: 'Dettagliato', t_static: 'Statico', t_animated: 'Animato',
    adaptive: 'Risoluzione adattiva', showFps: 'Mostra frequenza fotogrammi',
    postUnavailable: 'La post-elaborazione non è disponibile su questo dispositivo, quindi il gioco viene mostrato senza.',
    unknownGpu: 'GPU sconosciuta',
    w_noShadows: 'nessuna ombra', w_shadows: 'ombre {n}²', w_ao: 'occlusione ambientale', w_aoHigh: 'occlusione ambientale completa',
    w_bloom: 'bagliore', w_reflections: 'riflessi', w_particles: 'particelle', w_noAA: 'nessun anti-aliasing',
  };

  const STRINGS = { 'en-US': EN_US, 'en-GB': EN_GB, 'es-419': ES_419, 'es-ES': ES_ES, 'de-DE': DE, 'fr-FR': FR_FR, 'fr-CA': FR_CA, 'pt-BR': PT_BR, 'it-IT': IT };

  function pickLocale(lang) {
    const l = String(lang || 'en-US');
    if (STRINGS[l]) return l;
    const [base, region] = l.split('-');
    const b = (base || '').toLowerCase(), r = (region || '').toUpperCase();
    if (b === 'en') return ['GB', 'IE', 'AU', 'NZ', 'ZA', 'IN'].includes(r) ? 'en-GB' : 'en-US';
    if (b === 'es') return r === 'ES' ? 'es-ES' : 'es-419';
    if (b === 'fr') return r === 'CA' ? 'fr-CA' : 'fr-FR';
    if (b === 'pt') return 'pt-BR';
    if (b === 'de') return 'de-DE';
    if (b === 'it') return 'it-IT';
    return 'en-US';
  }
  let locale = pickLocale(global.navigator && global.navigator.language);
  function t(key, vars) {
    let s = (STRINGS[locale] && STRINGS[locale][key]) || EN_US[key] || key;
    if (vars) for (const k of Object.keys(vars)) s = s.replace('{' + k + '}', vars[k]);
    return s;
  }
  function setLocale(l) { locale = pickLocale(l); }

  function words() {
    return { noShadows: t('w_noShadows'), shadows: t('w_shadows'), ao: t('w_ao'), aoHigh: t('w_aoHigh'), bloom: t('w_bloom'), reflections: t('w_reflections'), particles: t('w_particles'), noAA: t('w_noAA') };
  }

  function el(tag, cls, text) {
    const e = global.document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function row(labelText, control) {
    const r = el('label', 'ce-settings-row ce-gfx-row' + (control.tagName === 'SELECT' || control.classList.contains('ce-gfx-scale') ? ' ce-gfx-wide' : ''));
    r.appendChild(el('span', 'ce-settings-label', labelText));
    r.appendChild(control);
    return r;
  }
  function option(sel, value, label, selected) {
    const o = el('option', null, label);
    o.value = value;
    if (selected) o.selected = true;
    sel.appendChild(o);
  }

  function summaryText(info) {
    const gpu = info.gpu && info.gpu !== 'unknown GPU' ? info.gpu : t('unknownGpu');
    return gpu + ' · ' + G.describe(info.resolved, info.pixels, words());
  }

  /**
   * Build the Graphics section into `host`. `getSaved()` returns the saved graphics object,
   * `onChange(next)` persists + applies it. Rebuilds itself after every change and keeps focus.
   */
  function build(host, getSaved, onChange) {
    const R = global.CERender;
    host.innerHTML = '';
    host.classList.add('ce-gfx-section');
    const s = Object.assign({}, getSaved() || {});
    const info = R.graphicsInfo();
    const q = info.resolved;
    const presetName = (p) => t('p_' + p);

    const commit = (next, focusId) => {
      onChange(next);
      build(host, getSaved, onChange);
      const f = focusId && global.document.getElementById(focusId);
      if (f) f.focus();
      // Pixel size settles on the next frame.
      global.requestAnimationFrame(() => global.requestAnimationFrame(() => {
        const sum = global.document.getElementById('gfx-summary');
        if (sum) sum.textContent = summaryText(R.graphicsInfo());
      }));
    };

    const preset = el('select');
    preset.id = 'gfx-preset';
    preset.dataset.gfx = 'preset';
    option(preset, 'auto', t('auto', { tier: presetName(info.detected) }), q.auto);
    for (const p of G.PRESETS) option(preset, p, presetName(p), !q.auto && q.preset === p);
    preset.addEventListener('change', () => commit(G.withPreset(getSaved(), preset.value), 'gfx-preset'));
    host.appendChild(row(t('quality'), preset));

    const scaleWrap = el('span', 'ce-gfx-scale');
    const scale = el('input');
    scale.type = 'range'; scale.min = '50'; scale.max = '200'; scale.step = '10';
    scale.id = 'gfx-scale';
    scale.dataset.gfx = 'render_scale';
    scale.value = String(Math.round(q.renderScale * 100));
    const out = el('output', 'ce-gfx-scale-value', scale.value + '%');
    out.id = 'gfx-scale-value';
    scale.addEventListener('input', () => { out.textContent = scale.value + '%'; });
    scale.addEventListener('change', () => commit(Object.assign({}, getSaved(), { render_scale: Number(scale.value) / 100 }), 'gfx-scale'));
    scaleWrap.append(scale, out);
    host.appendChild(row(t('renderScale'), scaleWrap));

    for (const cat of Object.keys(G.CATEGORIES)) {
      const sel = el('select');
      sel.id = 'gfx-' + cat;
      sel.dataset.gfxCat = cat;
      const override = G.CATEGORIES[cat].includes(s[cat]);
      option(sel, 'preset', t('fromPreset', { tier: t('t_' + G.presetTier(q.preset, cat)) }), !override);
      for (const tier of G.CATEGORIES[cat]) option(sel, tier, t('t_' + tier), override && s[cat] === tier);
      sel.addEventListener('change', () => {
        const next = Object.assign({}, getSaved());
        if (sel.value === 'preset') delete next[cat]; else next[cat] = sel.value;
        commit(next, sel.id);
      });
      host.appendChild(row(t('c_' + cat), sel));
    }

    for (const [key, id, label, val] of [['adaptive', 'gfx-adaptive', t('adaptive'), q.adaptive], ['show_fps', 'gfx-fps', t('showFps'), q.showFps]]) {
      const chk = el('input');
      chk.type = 'checkbox';
      chk.id = id;
      chk.dataset.gfx = key;
      chk.checked = !!val;
      chk.addEventListener('change', () => commit(Object.assign({}, getSaved(), { [key]: chk.checked }), id));
      host.appendChild(row(label, chk));
    }

    const sum = el('p', 'ce-gfx-summary', summaryText(info));
    sum.id = 'gfx-summary';
    sum.setAttribute('aria-live', 'polite');
    host.appendChild(sum);
    if (info.postFailed && q.post) {
      const note = el('p', 'ce-gfx-note', t('postUnavailable'));
      note.id = 'gfx-post-note';
      host.appendChild(note);
    }
  }

  global.CEGfxUI = { build, t, setLocale, pickLocale, STRINGS, summaryText };
})(typeof window !== 'undefined' ? window : globalThis);
