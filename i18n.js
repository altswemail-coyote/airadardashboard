// ─────────────────────────────────────────────────────────────────────────────
// i18n.js — Static UI translation table + instant DOM application
// Covers all fixed buttons, labels, and headings across dashboard + tracker.
// Dynamic article/summary content is handled separately by translatePage() (API).
// ─────────────────────────────────────────────────────────────────────────────

export const LANG_NAMES = {
  es: 'Spanish',  fr: 'French',   de: 'German',    pt: 'Portuguese',
  it: 'Italian',  ja: 'Japanese', zh: 'Chinese (Simplified)', ko: 'Korean',
  ar: 'Arabic',   nl: 'Dutch',    ru: 'Russian',   hi: 'Hindi',
};

export const UI_TRANSLATIONS = {
  en: {
    // Header / nav
    btn_scan: 'Scan', nav_tracked_topics: 'Tracked Topics',
    persona_executive: 'View as: Executive', persona_analyst: 'View as: Analyst',
    persona_strategist: 'View as: Strategist', persona_full: 'View as: Full Context',
    search_placeholder: "Search (e.g. 'Robotics', 'Healthcare')...",
    // Feed
    section_tag_monitor: 'MONITOR', section_tag_analyze: 'ANALYZE',
    feed_section_title: 'Signal Feed',
    feed_sort_relevant: 'Relevant', feed_sort_newest: 'Newest', feed_sort_confidence: 'Confidence',
    chip_top_news: 'Top News', chip_gen_ai: 'Gen AI', chip_agents: 'Agents',
    chip_robotics: 'Robotics', chip_policy: 'Policy',
    // Insight panel
    sidebar_section_title: 'Selected Insight',
    insight_empty_title: 'Select a Signal',
    insight_empty_desc: 'Click any item in the feed to see its intelligence breakdown',
    insight_metric_confidence: 'CONFIDENCE', insight_metric_timeline: 'TIMELINE',
    insight_section_why: 'WHY IT MATTERS', insight_section_actions: 'QUICK ACTIONS',
    insight_section_top: 'TOP ACTIONS',
    insight_toggle_briefing: 'Briefing', insight_toggle_disruptor: 'Disruptor',
    // Dashboard modals
    modal_page_brief_title: 'Page Brief',
    brief_loading_status: 'Generating Interactive Brief...', brief_loading_sub: 'Reading items from feed',
    btn_copy_analysis: 'Copy to Clipboard', btn_send_to_model: 'Send to Model',
    modal_countermove_title: 'Countermove',
    countermove_desc: "I'll analyze current market signals to identify strategic openings. Define the players:",
    countermove_label_you: 'YOUR ENTITY', countermove_label_them: 'THE COMPETITOR',
    btn_activate_countermove: 'Analyze Countermoves',
    modal_disruptor_title: '⚡ Disruptor',
    disruptor_loading_status: 'Analyzing signal mechanics…', disruptor_loading_sub: 'Building cross-industry map',
    btn_copy_disruptor: 'Copy to Clipboard',
    modal_history_title: 'Missed Intelligence Reports',
    modal_briefing_title: 'Saved Briefing Items',
    // Tracker: sidebar
    sidebar_count_label: 'Tracked\nTopics',
    sidebar_col_heading: 'Ranked by signal strength',
    // Tracker: drawer
    drawer_title: 'Tracking controls',
    section_add_topic: 'Add Topic', add_topic_placeholder: 'Add topic...', btn_add: 'Add',
    section_smarter: 'Smarter monitoring',
    lbl_industry: 'Industry', ph_industry: 'Healthcare...',
    lbl_brand: 'Brand', ph_brand: 'Nike, Pfizer...',
    lbl_role: 'Role', ph_role: 'CMO, VP...',
    lbl_priority: 'Priority', ph_priority: 'Automation...',
    lbl_headline_lang: 'Headline Language',
    recos_analyzing: 'AI Analyzing...', btn_generate: 'Generate',
    section_daily: 'Monitoring Rhythm', monitor_lbl: 'Auto-scan schedule', monitor_off: 'Off',
    section_radar_brief: 'Radar Brief',
    lbl_email: 'Your email', ph_email: 'you@example.com',
    lbl_topics_include: 'Topics to include',
    lbl_frequency: 'Frequency', lbl_format: 'Format',
    freq_one: '1 brief / week', freq_three: '3 briefs / week', freq_five: '5 briefs / week',
    fmt_brief: 'Brief', fmt_detailed: 'Detailed', fmt_narrative: 'Narrative', fmt_rawintel: 'Raw Intel',
    btn_preview_brief: 'Preview Radar Brief',
    // Tracker: schedule panel
    sched_days: 'Delivery Days', sched_time: 'Delivery Time', btn_confirm_sched: 'Confirm Schedule',
    day_mon: 'Mon', day_tue: 'Tue', day_wed: 'Wed', day_thu: 'Thu',
    day_fri: 'Fri', day_sat: 'Sat', day_sun: 'Sun',
    // Tracker: modal footer
    modal_copy: 'Copy to Clipboard', modal_export: 'Export ↓',
    export_copy_md: 'Copy as Markdown', export_dl_md: 'Download .md file', export_pdf: 'Print / Save as PDF',
    modal_send: 'Send to Model →', modal_schedule: 'Schedule Radar Brief',
    // Power Prompts + dynamic UI
    pp_label: 'Power Prompts', pp_generating: 'Generating prompts…',
    pp_strategic: 'Strategic Analysis', pp_competitive: 'Competitive Implications',
    pp_monitor: 'What to Monitor', pp_open_model: 'Open in your AI model',
    pp_intel_brief: 'Intelligence Brief', pp_btn: 'AI Prompt',
    pp_header: 'POWER PROMPTS', pp_exec_summary: 'Generate Executive Summary',
    fib_open: 'Open', fib_track: 'Track', fib_brief: 'Brief',
    action_open_article: 'Open full article', action_track_signal: 'Track this signal',
    action_gen_brief: 'Generate intelligence brief',
    eyebrow_analyze: 'Analyze', stat_articles: 'articles', stat_beliefs: 'beliefs',
    belief_lens_for_you: 'For you',
    stat_scanned: 'Scanned', btn_brief: 'Brief', btn_scanning: 'Scanning...',
    btn_scan_all: 'Scan All', btn_home: '← Home', btn_topic_controls: 'Topic Controls',
    dispatch_include_home_news: 'Include Top AI News',
    col_signals: 'Supporting signals', col_results: 'results', col_beliefs_ranked: 'ranked by confidence',
    btn_edit: 'Edit', btn_remove: 'Remove', topic_not_scanned: 'Not scanned yet',
    ph_fetching: 'Fetching articles...', ph_no_articles: 'No articles yet — click Scan Now',
    ph_gen_beliefs: 'Generating beliefs...', ph_beliefs_first: 'Beliefs generated on first scan',
    empty_topic_title: 'Select a topic', empty_topic_desc: 'Choose a tracked topic from the sidebar.',
    edit_save_rescan: 'Save & Rescan', edit_cancel: 'Cancel', btn_scanning_all: 'Scanning...',
  },

  es: {
    btn_scan: 'Buscar', nav_tracked_topics: 'Temas Seguidos',
    persona_executive: 'Vista: Ejecutivo', persona_analyst: 'Vista: Analista',
    persona_strategist: 'Vista: Estratega', persona_full: 'Vista: Contexto Completo',
    search_placeholder: "Buscar (p.ej. 'Robótica', 'Salud')...",
    section_tag_monitor: 'MONITOR', section_tag_analyze: 'ANÁLISIS',
    feed_section_title: 'Feed de Señales',
    feed_sort_relevant: 'Relevante', feed_sort_newest: 'Más reciente', feed_sort_confidence: 'Confianza',
    chip_top_news: 'Noticias', chip_gen_ai: 'IA Generativa', chip_agents: 'Agentes',
    chip_robotics: 'Robótica', chip_policy: 'Política',
    sidebar_section_title: 'Análisis Seleccionado',
    insight_empty_title: 'Selecciona una Señal',
    insight_empty_desc: 'Haz clic en cualquier elemento del feed para ver su análisis',
    insight_metric_confidence: 'CONFIANZA', insight_metric_timeline: 'HORIZONTE',
    insight_section_why: 'POR QUÉ IMPORTA', insight_section_actions: 'ACCIONES RÁPIDAS',
    insight_section_top: 'ACCIONES PRINCIPALES',
    insight_toggle_briefing: 'Informe', insight_toggle_disruptor: 'Disruptor',
    modal_page_brief_title: 'Informe de Página',
    brief_loading_status: 'Generando informe interactivo...', brief_loading_sub: 'Leyendo elementos del feed',
    btn_copy_analysis: 'Copiar al Portapapeles', btn_send_to_model: 'Enviar al Modelo',
    modal_countermove_title: 'Contramovimiento',
    countermove_desc: 'Analizaré las señales del mercado para identificar oportunidades estratégicas. Define los actores:',
    countermove_label_you: 'TU ENTIDAD', countermove_label_them: 'EL COMPETIDOR',
    btn_activate_countermove: 'Analizar Contramovimientos',
    modal_disruptor_title: '⚡ Disruptor',
    disruptor_loading_status: 'Analizando mecánicas de señal…', disruptor_loading_sub: 'Construyendo mapa entre industrias',
    btn_copy_disruptor: 'Copiar al Portapapeles',
    modal_history_title: 'Informes Perdidos', modal_briefing_title: 'Elementos Guardados',
    sidebar_count_label: 'Temas\nSeguidos', sidebar_col_heading: 'Clasificado por intensidad de señal',
    drawer_title: 'Controles de seguimiento',
    section_add_topic: 'Añadir Tema', add_topic_placeholder: 'Añadir tema...', btn_add: 'Añadir',
    section_smarter: 'Monitoreo inteligente',
    lbl_industry: 'Industria', ph_industry: 'Salud...',
    lbl_brand: 'Marca', ph_brand: 'Nike, Pfizer...',
    lbl_role: 'Rol', ph_role: 'CMO, VP...',
    lbl_priority: 'Prioridad', ph_priority: 'Automatización...',
    lbl_headline_lang: 'Idioma de Titulares',
    recos_analyzing: 'IA Analizando...', btn_generate: 'Generar',
    section_daily: 'Ritmo de monitoreo', monitor_lbl: 'Programa de análisis', monitor_off: 'Inactivo',
    section_radar_brief: 'Informe Radar',
    lbl_email: 'Tu correo', ph_email: 'tu@ejemplo.com',
    lbl_topics_include: 'Temas a incluir',
    lbl_frequency: 'Frecuencia', lbl_format: 'Formato',
    freq_one: '1 informe / semana', freq_three: '3 informes / semana', freq_five: '5 informes / semana',
    fmt_brief: 'Breve', fmt_detailed: 'Detallado', fmt_narrative: 'Narrativo', fmt_rawintel: 'Intel Bruto',
    btn_preview_brief: 'Vista previa del Informe',
    sched_days: 'Días de Entrega', sched_time: 'Hora de Entrega', btn_confirm_sched: 'Confirmar Horario',
    day_mon: 'Lun', day_tue: 'Mar', day_wed: 'Mié', day_thu: 'Jue',
    day_fri: 'Vie', day_sat: 'Sáb', day_sun: 'Dom',
    modal_copy: 'Copiar al Portapapeles', modal_export: 'Exportar ↓',
    export_copy_md: 'Copiar como Markdown', export_dl_md: 'Descargar archivo .md', export_pdf: 'Imprimir / Guardar como PDF',
    modal_send: 'Enviar al Modelo →', modal_schedule: 'Programar Informe Radar',
    pp_label: 'Prompts de Poder', pp_generating: 'Generando prompts…',
    pp_strategic: 'Análisis Estratégico', pp_competitive: 'Implicaciones Competitivas',
    pp_monitor: 'Qué Monitorear', pp_open_model: 'Abrir en tu modelo de IA',
    pp_intel_brief: 'Informe de Inteligencia', pp_btn: 'Prompt IA',
    pp_header: 'PROMPTS DE PODER', pp_exec_summary: 'Generar Resumen Ejecutivo',
    fib_open: 'Abrir', fib_track: 'Seguir', fib_brief: 'Informe',
    action_open_article: 'Abrir artículo completo', action_track_signal: 'Seguir esta señal',
    action_gen_brief: 'Generar informe de inteligencia',
    eyebrow_analyze: 'Analizar', stat_articles: 'artículos', stat_beliefs: 'creencias',
    belief_lens_for_you: 'Para ti',
    stat_scanned: 'Escaneado', btn_brief: 'Informe', btn_scanning: 'Escaneando...',
    btn_scan_all: 'Escanear Todo', btn_home: '← Inicio', btn_topic_controls: 'Controles de Tema',
    col_signals: 'Señales de apoyo', col_results: 'resultados', col_beliefs_ranked: 'clasificadas por confianza',
    btn_edit: 'Editar', btn_remove: 'Eliminar', topic_not_scanned: 'Aún no escaneado',
    ph_fetching: 'Obteniendo artículos...', ph_no_articles: 'Sin artículos aún — haz clic en Escanear',
    ph_gen_beliefs: 'Generando creencias...', ph_beliefs_first: 'Creencias generadas en el primer escaneo',
    empty_topic_title: 'Selecciona un tema', empty_topic_desc: 'Elige un tema seguido de la barra lateral.',
    edit_save_rescan: 'Guardar y Reescanear', edit_cancel: 'Cancelar', btn_scanning_all: 'Escaneando...',
  },

  fr: {
    btn_scan: 'Rechercher', nav_tracked_topics: 'Sujets Suivis',
    persona_executive: 'Vue : Dirigeant', persona_analyst: 'Vue : Analyste',
    persona_strategist: 'Vue : Stratège', persona_full: 'Vue : Contexte Complet',
    search_placeholder: "Rechercher (ex. 'Robotique', 'Santé')...",
    section_tag_monitor: 'SURVEILLER', section_tag_analyze: 'ANALYSER',
    feed_section_title: 'Flux de Signaux',
    feed_sort_relevant: 'Pertinent', feed_sort_newest: 'Plus récent', feed_sort_confidence: 'Confiance',
    chip_top_news: 'Actualités', chip_gen_ai: 'IA Générative', chip_agents: 'Agents',
    chip_robotics: 'Robotique', chip_policy: 'Politique',
    sidebar_section_title: 'Analyse Sélectionnée',
    insight_empty_title: 'Sélectionnez un Signal',
    insight_empty_desc: 'Cliquez sur un élément du flux pour voir son analyse détaillée',
    insight_metric_confidence: 'CONFIANCE', insight_metric_timeline: 'HORIZON',
    insight_section_why: "POURQUOI C'EST IMPORTANT", insight_section_actions: 'ACTIONS RAPIDES',
    insight_section_top: 'ACTIONS PRINCIPALES',
    insight_toggle_briefing: 'Synthèse', insight_toggle_disruptor: 'Perturbateur',
    modal_page_brief_title: 'Synthèse de Page',
    brief_loading_status: 'Génération de la synthèse interactive...', brief_loading_sub: 'Lecture des éléments du flux',
    btn_copy_analysis: 'Copier dans le Presse-papiers', btn_send_to_model: 'Envoyer au Modèle',
    modal_countermove_title: 'Contre-Mesure',
    countermove_desc: "J'analyserai les signaux du marché pour identifier des ouvertures stratégiques. Définissez les acteurs :",
    countermove_label_you: 'VOTRE ENTITÉ', countermove_label_them: 'LE CONCURRENT',
    btn_activate_countermove: 'Analyser les Contre-mesures',
    modal_disruptor_title: '⚡ Perturbateur',
    disruptor_loading_status: 'Analyse des mécanismes de signal…', disruptor_loading_sub: 'Construction de la carte intersectorielle',
    btn_copy_disruptor: 'Copier dans le Presse-papiers',
    modal_history_title: 'Rapports Manqués', modal_briefing_title: 'Éléments Sauvegardés',
    sidebar_count_label: 'Sujets\nSuivis', sidebar_col_heading: 'Classé par intensité du signal',
    drawer_title: 'Contrôles de suivi',
    section_add_topic: 'Ajouter un Sujet', add_topic_placeholder: 'Ajouter un sujet...', btn_add: 'Ajouter',
    section_smarter: 'Surveillance intelligente',
    lbl_industry: 'Secteur', ph_industry: 'Santé...',
    lbl_brand: 'Marque', ph_brand: 'Nike, Pfizer...',
    lbl_role: 'Rôle', ph_role: 'DG, VP...',
    lbl_priority: 'Priorité', ph_priority: 'Automatisation...',
    lbl_headline_lang: 'Langue des Titres',
    recos_analyzing: "IA en cours d'analyse...", btn_generate: 'Générer',
    section_daily: 'Rythme de suivi', monitor_lbl: "Programme d'analyse", monitor_off: 'Inactif',
    section_radar_brief: 'Synthèse Radar',
    lbl_email: 'Votre email', ph_email: 'vous@exemple.com',
    lbl_topics_include: 'Sujets à inclure',
    lbl_frequency: 'Fréquence', lbl_format: 'Format',
    freq_one: '1 brief / semaine', freq_three: '3 briefs / semaine', freq_five: '5 briefs / semaine',
    fmt_brief: 'Bref', fmt_detailed: 'Détaillé', fmt_narrative: 'Narratif', fmt_rawintel: 'Intel Brut',
    btn_preview_brief: 'Aperçu de la Synthèse',
    sched_days: 'Jours de Livraison', sched_time: 'Heure de Livraison', btn_confirm_sched: 'Confirmer le Calendrier',
    day_mon: 'Lun', day_tue: 'Mar', day_wed: 'Mer', day_thu: 'Jeu',
    day_fri: 'Ven', day_sat: 'Sam', day_sun: 'Dim',
    modal_copy: 'Copier dans le Presse-papiers', modal_export: 'Exporter ↓',
    export_copy_md: 'Copier en Markdown', export_dl_md: 'Télécharger fichier .md', export_pdf: 'Imprimer / Enregistrer en PDF',
    modal_send: 'Envoyer au Modèle →', modal_schedule: 'Planifier la Synthèse Radar',
    pp_label: 'Prompts Puissants', pp_generating: 'Génération des prompts…',
    pp_strategic: 'Analyse Stratégique', pp_competitive: 'Implications Concurrentielles',
    pp_monitor: 'À Surveiller', pp_open_model: 'Ouvrir dans votre modèle IA',
    pp_intel_brief: 'Synthèse de Renseignement', pp_btn: 'Prompt IA',
    pp_header: 'PROMPTS PUISSANTS', pp_exec_summary: 'Générer un Résumé Exécutif',
    fib_open: 'Ouvrir', fib_track: 'Suivre', fib_brief: 'Synthèse',
    action_open_article: "Ouvrir l'article complet", action_track_signal: 'Suivre ce signal',
    action_gen_brief: 'Générer une synthèse de renseignement',
    eyebrow_analyze: 'Analyser', stat_articles: 'articles', stat_beliefs: 'croyances',
    belief_lens_for_you: 'Pour vous',
    stat_scanned: 'Analysé', btn_brief: 'Synthèse', btn_scanning: 'Analyse en cours...',
    btn_scan_all: 'Analyser tout', btn_home: '← Accueil', btn_topic_controls: 'Paramètres du sujet',
    col_signals: 'Signaux de soutien', col_results: 'résultats', col_beliefs_ranked: 'classées par confiance',
    btn_edit: 'Modifier', btn_remove: 'Supprimer', topic_not_scanned: 'Pas encore analysé',
    ph_fetching: 'Récupération des articles...', ph_no_articles: 'Aucun article — cliquez sur Analyser',
    ph_gen_beliefs: 'Génération des croyances...', ph_beliefs_first: 'Croyances générées à la première analyse',
    empty_topic_title: 'Sélectionnez un sujet', empty_topic_desc: 'Choisissez un sujet suivi dans la barre latérale.',
    edit_save_rescan: 'Enregistrer et Réanalyser', edit_cancel: 'Annuler', btn_scanning_all: 'Analyse en cours...',
  },

  de: {
    btn_scan: 'Suchen', nav_tracked_topics: 'Verfolgte Themen',
    persona_executive: 'Als: Führungskraft', persona_analyst: 'Als: Analyst',
    persona_strategist: 'Als: Stratege', persona_full: 'Als: Vollständiger Kontext',
    search_placeholder: "Suchen (z.B. 'Robotik', 'Gesundheit')...",
    section_tag_monitor: 'MONITOR', section_tag_analyze: 'ANALYSE',
    feed_section_title: 'Signal-Feed',
    feed_sort_relevant: 'Relevant', feed_sort_newest: 'Neueste', feed_sort_confidence: 'Konfidenz',
    chip_top_news: 'Top-Nachrichten', chip_gen_ai: 'Generative KI', chip_agents: 'Agenten',
    chip_robotics: 'Robotik', chip_policy: 'Politik',
    sidebar_section_title: 'Ausgewählte Analyse',
    insight_empty_title: 'Signal auswählen',
    insight_empty_desc: 'Klicke auf einen Feed-Eintrag für die Detailanalyse',
    insight_metric_confidence: 'KONFIDENZ', insight_metric_timeline: 'ZEITRAUM',
    insight_section_why: 'WARUM ES WICHTIG IST', insight_section_actions: 'SCHNELLAKTIONEN',
    insight_section_top: 'HAUPTAKTIONEN',
    insight_toggle_briefing: 'Bericht', insight_toggle_disruptor: 'Disruptor',
    modal_page_brief_title: 'Seiten-Bericht',
    brief_loading_status: 'Interaktiven Bericht erstellen...', brief_loading_sub: 'Feed-Einträge werden gelesen',
    btn_copy_analysis: 'In Zwischenablage kopieren', btn_send_to_model: 'An Modell senden',
    modal_countermove_title: 'Gegenzug',
    countermove_desc: 'Ich analysiere Marktsignale zur Identifikation strategischer Chancen. Definiere die Akteure:',
    countermove_label_you: 'DEINE EINHEIT', countermove_label_them: 'DER WETTBEWERBER',
    btn_activate_countermove: 'Gegenzüge analysieren',
    modal_disruptor_title: '⚡ Disruptor',
    disruptor_loading_status: 'Signalmechaniken analysieren…', disruptor_loading_sub: 'Branchenübergreifende Karte erstellen',
    btn_copy_disruptor: 'In Zwischenablage kopieren',
    modal_history_title: 'Verpasste Berichte', modal_briefing_title: 'Gespeicherte Elemente',
    sidebar_count_label: 'Verfolgte\nThemen', sidebar_col_heading: 'Nach Signalstärke gerankt',
    drawer_title: 'Tracking-Steuerung',
    section_add_topic: 'Thema hinzufügen', add_topic_placeholder: 'Thema hinzufügen...', btn_add: 'Hinzufügen',
    section_smarter: 'Intelligentes Monitoring',
    lbl_industry: 'Branche', ph_industry: 'Gesundheit...',
    lbl_brand: 'Marke', ph_brand: 'Nike, Pfizer...',
    lbl_role: 'Rolle', ph_role: 'CMO, VP...',
    lbl_priority: 'Priorität', ph_priority: 'Automatisierung...',
    lbl_headline_lang: 'Überschriftensprache',
    recos_analyzing: 'KI analysiert...', btn_generate: 'Generieren',
    section_daily: 'Monitoring-Rhythmus', monitor_lbl: 'Scan-Zeitplan', monitor_off: 'Inaktiv',
    section_radar_brief: 'Radar-Bericht',
    lbl_email: 'Deine E-Mail', ph_email: 'du@beispiel.de',
    lbl_topics_include: 'Einzuschließende Themen',
    lbl_frequency: 'Häufigkeit', lbl_format: 'Format',
    freq_one: '1 Brief / Woche', freq_three: '3 Briefs / Woche', freq_five: '5 Briefs / Woche',
    fmt_brief: 'Kurz', fmt_detailed: 'Detailliert', fmt_narrative: 'Narrativ', fmt_rawintel: 'Rohdaten',
    btn_preview_brief: 'Bericht-Vorschau',
    sched_days: 'Liefertage', sched_time: 'Lieferzeit', btn_confirm_sched: 'Zeitplan bestätigen',
    day_mon: 'Mo', day_tue: 'Di', day_wed: 'Mi', day_thu: 'Do',
    day_fri: 'Fr', day_sat: 'Sa', day_sun: 'So',
    modal_copy: 'In Zwischenablage kopieren', modal_export: 'Exportieren ↓',
    export_copy_md: 'Als Markdown kopieren', export_dl_md: '.md-Datei herunterladen', export_pdf: 'Drucken / Als PDF speichern',
    modal_send: 'An Modell senden →', modal_schedule: 'Radar-Bericht planen',
    pp_label: 'Power-Prompts', pp_generating: 'Prompts werden generiert…',
    pp_strategic: 'Strategische Analyse', pp_competitive: 'Wettbewerbsimplikationen',
    pp_monitor: 'Was zu beobachten ist', pp_open_model: 'Im KI-Modell öffnen',
    pp_intel_brief: 'Geheimdienstbericht', pp_btn: 'KI-Prompt',
    pp_header: 'POWER-PROMPTS', pp_exec_summary: 'Zusammenfassung erstellen',
    fib_open: 'Öffnen', fib_track: 'Verfolgen', fib_brief: 'Bericht',
    action_open_article: 'Vollständigen Artikel öffnen', action_track_signal: 'Dieses Signal verfolgen',
    action_gen_brief: 'Geheimdienstbericht erstellen',
    eyebrow_analyze: 'Analysieren', stat_articles: 'Artikel', stat_beliefs: 'Überzeugungen',
    belief_lens_for_you: 'Für Sie',
    stat_scanned: 'Gescannt', btn_brief: 'Bericht', btn_scanning: 'Scannt...',
    btn_scan_all: 'Alle scannen', btn_home: '← Startseite', btn_topic_controls: 'Themeneinstellungen',
    col_signals: 'Unterstützende Signale', col_results: 'Ergebnisse', col_beliefs_ranked: 'nach Konfidenz gerankt',
    btn_edit: 'Bearbeiten', btn_remove: 'Entfernen', topic_not_scanned: 'Noch nicht gescannt',
    ph_fetching: 'Artikel werden abgerufen...', ph_no_articles: 'Noch keine Artikel — Scannen klicken',
    ph_gen_beliefs: 'Überzeugungen werden generiert...', ph_beliefs_first: 'Überzeugungen beim ersten Scan generiert',
    empty_topic_title: 'Thema auswählen', empty_topic_desc: 'Wähle ein verfolgtes Thema aus der Seitenleiste.',
    edit_save_rescan: 'Speichern & Neu scannen', edit_cancel: 'Abbrechen', btn_scanning_all: 'Scannt...',
  },

  pt: {
    btn_scan: 'Pesquisar', nav_tracked_topics: 'Tópicos Monitorados',
    persona_executive: 'Ver como: Executivo', persona_analyst: 'Ver como: Analista',
    persona_strategist: 'Ver como: Estrategista', persona_full: 'Ver como: Contexto Completo',
    search_placeholder: "Pesquisar (ex. 'Robótica', 'Saúde')...",
    section_tag_monitor: 'MONITORAR', section_tag_analyze: 'ANALISAR',
    feed_section_title: 'Feed de Sinais',
    feed_sort_relevant: 'Relevante', feed_sort_newest: 'Mais recente', feed_sort_confidence: 'Confiança',
    chip_top_news: 'Notícias', chip_gen_ai: 'IA Generativa', chip_agents: 'Agentes',
    chip_robotics: 'Robótica', chip_policy: 'Política',
    sidebar_section_title: 'Análise Selecionada',
    insight_empty_title: 'Selecione um Sinal',
    insight_empty_desc: 'Clique em qualquer item do feed para ver a análise detalhada',
    insight_metric_confidence: 'CONFIANÇA', insight_metric_timeline: 'HORIZONTE',
    insight_section_why: 'POR QUE IMPORTA', insight_section_actions: 'AÇÕES RÁPIDAS',
    insight_section_top: 'AÇÕES PRINCIPAIS',
    insight_toggle_briefing: 'Relatório', insight_toggle_disruptor: 'Disruptor',
    modal_page_brief_title: 'Relatório de Página',
    brief_loading_status: 'Gerando relatório interativo...', brief_loading_sub: 'Lendo itens do feed',
    btn_copy_analysis: 'Copiar para Área de Transferência', btn_send_to_model: 'Enviar ao Modelo',
    modal_countermove_title: 'Contramovimento',
    countermove_desc: 'Analisarei os sinais de mercado para identificar oportunidades estratégicas. Defina os atores:',
    countermove_label_you: 'SUA ENTIDADE', countermove_label_them: 'O CONCORRENTE',
    btn_activate_countermove: 'Analisar Contramovimentos',
    modal_disruptor_title: '⚡ Disruptor',
    disruptor_loading_status: 'Analisando mecânicas de sinal…', disruptor_loading_sub: 'Construindo mapa entre setores',
    btn_copy_disruptor: 'Copiar para Área de Transferência',
    modal_history_title: 'Relatórios Perdidos', modal_briefing_title: 'Itens Salvos',
    sidebar_count_label: 'Tópicos\nMonitorados', sidebar_col_heading: 'Classificado por intensidade do sinal',
    drawer_title: 'Controles de monitoramento',
    section_add_topic: 'Adicionar Tópico', add_topic_placeholder: 'Adicionar tópico...', btn_add: 'Adicionar',
    section_smarter: 'Monitoramento inteligente',
    lbl_industry: 'Setor', ph_industry: 'Saúde...',
    lbl_brand: 'Marca', ph_brand: 'Nike, Pfizer...',
    lbl_role: 'Função', ph_role: 'CMO, VP...',
    lbl_priority: 'Prioridade', ph_priority: 'Automação...',
    lbl_headline_lang: 'Idioma dos Títulos',
    recos_analyzing: 'IA Analisando...', btn_generate: 'Gerar',
    section_daily: 'Ritmo de monitoramento', monitor_lbl: 'Agenda de análise', monitor_off: 'Inativo',
    section_radar_brief: 'Relatório Radar',
    lbl_email: 'Seu e-mail', ph_email: 'voce@exemplo.com',
    lbl_topics_include: 'Tópicos a incluir',
    lbl_frequency: 'Frequência', lbl_format: 'Formato',
    freq_one: '1 briefing / semana', freq_three: '3 briefings / semana', freq_five: '5 briefings / semana',
    fmt_brief: 'Breve', fmt_detailed: 'Detalhado', fmt_narrative: 'Narrativo', fmt_rawintel: 'Intel Bruto',
    btn_preview_brief: 'Prévia do Relatório',
    sched_days: 'Dias de Entrega', sched_time: 'Horário de Entrega', btn_confirm_sched: 'Confirmar Agendamento',
    day_mon: 'Seg', day_tue: 'Ter', day_wed: 'Qua', day_thu: 'Qui',
    day_fri: 'Sex', day_sat: 'Sáb', day_sun: 'Dom',
    modal_copy: 'Copiar para Área de Transferência', modal_export: 'Exportar ↓',
    export_copy_md: 'Copiar como Markdown', export_dl_md: 'Baixar arquivo .md', export_pdf: 'Imprimir / Salvar como PDF',
    modal_send: 'Enviar ao Modelo →', modal_schedule: 'Agendar Relatório Radar',
    pp_label: 'Power Prompts', pp_generating: 'Gerando prompts…',
    pp_strategic: 'Análise Estratégica', pp_competitive: 'Implicações Competitivas',
    pp_monitor: 'O Que Monitorar', pp_open_model: 'Abrir no modelo de IA',
    pp_intel_brief: 'Relatório de Inteligência', pp_btn: 'Prompt IA',
    pp_header: 'POWER PROMPTS', pp_exec_summary: 'Gerar Resumo Executivo',
    fib_open: 'Abrir', fib_track: 'Rastrear', fib_brief: 'Relatório',
    action_open_article: 'Abrir artigo completo', action_track_signal: 'Rastrear este sinal',
    action_gen_brief: 'Gerar relatório de inteligência',
    eyebrow_analyze: 'Analisar', stat_articles: 'artigos', stat_beliefs: 'crenças',
    belief_lens_for_you: 'Para você',
    stat_scanned: 'Analisado', btn_brief: 'Relatório', btn_scanning: 'Analisando...',
    btn_scan_all: 'Analisar Tudo', btn_home: '← Início', btn_topic_controls: 'Controles de Tópico',
    col_signals: 'Sinais de suporte', col_results: 'resultados', col_beliefs_ranked: 'classificadas por confiança',
    btn_edit: 'Editar', btn_remove: 'Remover', topic_not_scanned: 'Ainda não analisado',
    ph_fetching: 'Buscando artigos...', ph_no_articles: 'Sem artigos — clique em Analisar',
    ph_gen_beliefs: 'Gerando crenças...', ph_beliefs_first: 'Crenças geradas na primeira análise',
    empty_topic_title: 'Selecione um tópico', empty_topic_desc: 'Escolha um tópico rastreado na barra lateral.',
    edit_save_rescan: 'Salvar e Reanalisar', edit_cancel: 'Cancelar', btn_scanning_all: 'Analisando...',
  },

  it: {
    btn_scan: 'Cerca', nav_tracked_topics: 'Argomenti Monitorati',
    persona_executive: 'Vista: Dirigente', persona_analyst: 'Vista: Analista',
    persona_strategist: 'Vista: Stratega', persona_full: 'Vista: Contesto Completo',
    search_placeholder: "Cerca (es. 'Robotica', 'Salute')...",
    section_tag_monitor: 'MONITORARE', section_tag_analyze: 'ANALIZZARE',
    feed_section_title: 'Feed dei Segnali',
    feed_sort_relevant: 'Rilevante', feed_sort_newest: 'Più recente', feed_sort_confidence: 'Confidenza',
    chip_top_news: 'Notizie', chip_gen_ai: 'IA Generativa', chip_agents: 'Agenti',
    chip_robotics: 'Robotica', chip_policy: 'Politica',
    sidebar_section_title: 'Analisi Selezionata',
    insight_empty_title: 'Seleziona un Segnale',
    insight_empty_desc: "Clicca su qualsiasi elemento del feed per vedere l'analisi",
    insight_metric_confidence: 'CONFIDENZA', insight_metric_timeline: 'ORIZZONTE',
    insight_section_why: 'PERCHÉ CONTA', insight_section_actions: 'AZIONI RAPIDE',
    insight_section_top: 'AZIONI PRINCIPALI',
    insight_toggle_briefing: 'Briefing', insight_toggle_disruptor: 'Disruptore',
    modal_page_brief_title: 'Sintesi di Pagina',
    brief_loading_status: 'Generazione sintesi interattiva...', brief_loading_sub: 'Lettura elementi dal feed',
    btn_copy_analysis: 'Copia negli Appunti', btn_send_to_model: 'Invia al Modello',
    modal_countermove_title: 'Contromossa',
    countermove_desc: "Analizzerò i segnali di mercato per identificare aperture strategiche. Definisci gli attori:",
    countermove_label_you: 'LA TUA ENTITÀ', countermove_label_them: 'IL CONCORRENTE',
    btn_activate_countermove: 'Analizza Contromosse',
    modal_disruptor_title: '⚡ Disruptore',
    disruptor_loading_status: 'Analisi meccaniche del segnale…', disruptor_loading_sub: 'Creazione mappa intersettoriale',
    btn_copy_disruptor: 'Copia negli Appunti',
    modal_history_title: 'Rapporti Persi', modal_briefing_title: 'Elementi Salvati',
    sidebar_count_label: 'Argomenti\nMonitorati', sidebar_col_heading: 'Classificato per intensità del segnale',
    drawer_title: 'Controlli di monitoraggio',
    section_add_topic: 'Aggiungi Argomento', add_topic_placeholder: 'Aggiungi argomento...', btn_add: 'Aggiungi',
    section_smarter: 'Monitoraggio intelligente',
    lbl_industry: 'Settore', ph_industry: 'Salute...',
    lbl_brand: 'Marca', ph_brand: 'Nike, Pfizer...',
    lbl_role: 'Ruolo', ph_role: 'CMO, VP...',
    lbl_priority: 'Priorità', ph_priority: 'Automazione...',
    lbl_headline_lang: 'Lingua dei Titoli',
    recos_analyzing: 'IA in analisi...', btn_generate: 'Genera',
    section_daily: 'Ritmo di monitoraggio', monitor_lbl: 'Programma di scansione', monitor_off: 'Inattivo',
    section_radar_brief: 'Sintesi Radar',
    lbl_email: 'La tua email', ph_email: 'tu@esempio.it',
    lbl_topics_include: 'Argomenti da includere',
    lbl_frequency: 'Frequenza', lbl_format: 'Formato',
    freq_one: '1 brief / settimana', freq_three: '3 brief / settimana', freq_five: '5 brief / settimana',
    fmt_brief: 'Breve', fmt_detailed: 'Dettagliato', fmt_narrative: 'Narrativo', fmt_rawintel: 'Intel Grezzo',
    btn_preview_brief: 'Anteprima Sintesi',
    sched_days: 'Giorni di Consegna', sched_time: 'Orario di Consegna', btn_confirm_sched: 'Conferma Programma',
    day_mon: 'Lun', day_tue: 'Mar', day_wed: 'Mer', day_thu: 'Gio',
    day_fri: 'Ven', day_sat: 'Sab', day_sun: 'Dom',
    modal_copy: 'Copia negli Appunti', modal_export: 'Esporta ↓',
    export_copy_md: 'Copia come Markdown', export_dl_md: 'Scarica file .md', export_pdf: 'Stampa / Salva come PDF',
    modal_send: 'Invia al Modello →', modal_schedule: 'Pianifica Sintesi Radar',
    pp_label: 'Power Prompt', pp_generating: 'Generazione prompt in corso…',
    pp_strategic: 'Analisi Strategica', pp_competitive: 'Implicazioni Competitive',
    pp_monitor: 'Cosa Monitorare', pp_open_model: 'Apri nel modello IA',
    pp_intel_brief: 'Sintesi di Intelligence', pp_btn: 'Prompt IA',
    pp_header: 'POWER PROMPT', pp_exec_summary: 'Genera Sommario Esecutivo',
    fib_open: 'Apri', fib_track: 'Monitora', fib_brief: 'Sintesi',
    action_open_article: 'Apri articolo completo', action_track_signal: 'Monitora questo segnale',
    action_gen_brief: 'Genera sintesi di intelligence',
    eyebrow_analyze: 'Analizzare', stat_articles: 'articoli', stat_beliefs: 'convinzioni',
    belief_lens_for_you: 'Per te',
    stat_scanned: 'Analizzato', btn_brief: 'Sintesi', btn_scanning: 'Analisi...',
    btn_scan_all: 'Analizza Tutto', btn_home: '← Home', btn_topic_controls: 'Controlli Argomento',
    col_signals: 'Segnali di supporto', col_results: 'risultati', col_beliefs_ranked: 'classificate per confidenza',
    btn_edit: 'Modifica', btn_remove: 'Rimuovi', topic_not_scanned: 'Non ancora analizzato',
    ph_fetching: 'Recupero articoli...', ph_no_articles: 'Nessun articolo — clicca Analizza',
    ph_gen_beliefs: 'Generazione convinzioni...', ph_beliefs_first: 'Convinzioni generate alla prima analisi',
    empty_topic_title: 'Seleziona un argomento', empty_topic_desc: 'Scegli un argomento monitorato dalla barra laterale.',
    edit_save_rescan: 'Salva e Rianalizza', edit_cancel: 'Annulla', btn_scanning_all: 'Analisi...',
  },

  ja: {
    btn_scan: '検索', nav_tracked_topics: '追跡中のトピック',
    persona_executive: '表示：エグゼクティブ', persona_analyst: '表示：アナリスト',
    persona_strategist: '表示：ストラテジスト', persona_full: '表示：完全なコンテキスト',
    search_placeholder: "検索（例：'ロボティクス'、'医療'）...",
    section_tag_monitor: 'モニター', section_tag_analyze: '分析',
    feed_section_title: 'シグナルフィード',
    feed_sort_relevant: '関連性', feed_sort_newest: '最新', feed_sort_confidence: '信頼度',
    chip_top_news: 'トップニュース', chip_gen_ai: '生成AI', chip_agents: 'エージェント',
    chip_robotics: 'ロボティクス', chip_policy: '政策',
    sidebar_section_title: '選択したインサイト',
    insight_empty_title: 'シグナルを選択',
    insight_empty_desc: 'フィードのアイテムをクリックして詳細分析を表示',
    insight_metric_confidence: '信頼度', insight_metric_timeline: 'タイムライン',
    insight_section_why: 'なぜ重要か', insight_section_actions: 'クイックアクション',
    insight_section_top: 'トップアクション',
    insight_toggle_briefing: 'ブリーフィング', insight_toggle_disruptor: 'ディスラプター',
    modal_page_brief_title: 'ページブリーフ',
    brief_loading_status: 'インタラクティブブリーフを生成中...', brief_loading_sub: 'フィードアイテムを読み込み中',
    btn_copy_analysis: 'クリップボードにコピー', btn_send_to_model: 'モデルに送信',
    modal_countermove_title: '対抗戦略',
    countermove_desc: '市場シグナルを分析して戦略的機会を特定します。関係者を定義してください：',
    countermove_label_you: 'あなたの組織', countermove_label_them: '競合相手',
    btn_activate_countermove: '対抗戦略を分析',
    modal_disruptor_title: '⚡ ディスラプター',
    disruptor_loading_status: 'シグナルメカニクスを分析中…', disruptor_loading_sub: '業界横断マップを構築中',
    btn_copy_disruptor: 'クリップボードにコピー',
    modal_history_title: '見逃したレポート', modal_briefing_title: '保存済みアイテム',
    sidebar_count_label: '追跡中の\nトピック', sidebar_col_heading: 'シグナル強度でランク付け',
    drawer_title: '追跡コントロール',
    section_add_topic: 'トピックを追加', add_topic_placeholder: 'トピックを追加...', btn_add: '追加',
    section_smarter: 'スマートモニタリング',
    lbl_industry: '業界', ph_industry: '医療...',
    lbl_brand: 'ブランド', ph_brand: 'Nike, Pfizer...',
    lbl_role: '役割', ph_role: 'CMO, VP...',
    lbl_priority: '優先事項', ph_priority: '自動化...',
    lbl_headline_lang: '見出し言語',
    recos_analyzing: 'AI分析中...', btn_generate: '生成',
    section_daily: 'モニタリングのリズム', monitor_lbl: 'スキャンスケジュール', monitor_off: 'オフ',
    section_radar_brief: 'レーダーブリーフ',
    lbl_email: 'メールアドレス', ph_email: 'your@email.jp',
    lbl_topics_include: '含めるトピック',
    lbl_frequency: '頻度', lbl_format: 'フォーマット',
    freq_one: '週1回のブリーフ', freq_three: '週3回のブリーフ', freq_five: '週5回のブリーフ',
    fmt_brief: '簡潔', fmt_detailed: '詳細', fmt_narrative: 'ナラティブ', fmt_rawintel: '生インテル',
    btn_preview_brief: 'ブリーフのプレビュー',
    sched_days: '配信日', sched_time: '配信時刻', btn_confirm_sched: 'スケジュールを確認',
    day_mon: '月', day_tue: '火', day_wed: '水', day_thu: '木',
    day_fri: '金', day_sat: '土', day_sun: '日',
    modal_copy: 'クリップボードにコピー', modal_export: 'エクスポート ↓',
    export_copy_md: 'Markdownとしてコピー', export_dl_md: '.mdファイルをダウンロード', export_pdf: '印刷 / PDFとして保存',
    modal_send: 'モデルに送信 →', modal_schedule: 'レーダーブリーフをスケジュール',
    pp_label: 'パワープロンプト', pp_generating: 'プロンプト生成中…',
    pp_strategic: '戦略分析', pp_competitive: '競合への影響',
    pp_monitor: '監視すべき事項', pp_open_model: 'AIモデルで開く',
    pp_intel_brief: 'インテリジェンスブリーフ', pp_btn: 'AIプロンプト',
    pp_header: 'パワープロンプト', pp_exec_summary: 'エグゼクティブサマリーを生成',
    fib_open: '開く', fib_track: '追跡', fib_brief: 'ブリーフ',
    action_open_article: '記事全文を開く', action_track_signal: 'このシグナルを追跡',
    action_gen_brief: 'インテリジェンスブリーフを生成',
    eyebrow_analyze: '分析', stat_articles: '記事', stat_beliefs: '仮説',
    belief_lens_for_you: 'あなた向け',
    stat_scanned: 'スキャン済', btn_brief: 'ブリーフ', btn_scanning: 'スキャン中...',
    btn_scan_all: '全てスキャン', btn_home: '← ホーム', btn_topic_controls: 'トピック管理',
    col_signals: 'サポートシグナル', col_results: '件の結果', col_beliefs_ranked: '信頼度でランク付け',
    btn_edit: '編集', btn_remove: '削除', topic_not_scanned: '未スキャン',
    ph_fetching: '記事を取得中...', ph_no_articles: '記事なし — スキャンをクリック',
    ph_gen_beliefs: '仮説を生成中...', ph_beliefs_first: '初回スキャン時に仮説を生成',
    empty_topic_title: 'トピックを選択', empty_topic_desc: 'サイドバーから追跡中のトピックを選択してください。',
    edit_save_rescan: '保存して再スキャン', edit_cancel: 'キャンセル', btn_scanning_all: 'スキャン中...',
  },

  zh: {
    btn_scan: '搜索', nav_tracked_topics: '追踪话题',
    persona_executive: '视角：高管', persona_analyst: '视角：分析师',
    persona_strategist: '视角：战略师', persona_full: '视角：完整背景',
    search_placeholder: "搜索（如：'机器人技术'、'医疗'）...",
    section_tag_monitor: '监控', section_tag_analyze: '分析',
    feed_section_title: '信号动态',
    feed_sort_relevant: '相关性', feed_sort_newest: '最新', feed_sort_confidence: '置信度',
    chip_top_news: '头条新闻', chip_gen_ai: '生成式AI', chip_agents: '智能体',
    chip_robotics: '机器人技术', chip_policy: '政策',
    sidebar_section_title: '选定洞察',
    insight_empty_title: '选择一个信号',
    insight_empty_desc: '点击动态中的任意项目查看智能分析',
    insight_metric_confidence: '置信度', insight_metric_timeline: '时间线',
    insight_section_why: '为何重要', insight_section_actions: '快速操作',
    insight_section_top: '主要操作',
    insight_toggle_briefing: '简报', insight_toggle_disruptor: '颠覆者',
    modal_page_brief_title: '页面简报',
    brief_loading_status: '正在生成互动简报...', brief_loading_sub: '正在读取动态项目',
    btn_copy_analysis: '复制到剪贴板', btn_send_to_model: '发送至模型',
    modal_countermove_title: '反制策略',
    countermove_desc: '我将分析市场信号以识别战略机会。定义参与者：',
    countermove_label_you: '你的实体', countermove_label_them: '竞争对手',
    btn_activate_countermove: '分析反制策略',
    modal_disruptor_title: '⚡ 颠覆者',
    disruptor_loading_status: '正在分析信号机制…', disruptor_loading_sub: '正在构建跨行业地图',
    btn_copy_disruptor: '复制到剪贴板',
    modal_history_title: '错过的报告', modal_briefing_title: '已保存项目',
    sidebar_count_label: '追踪\n话题', sidebar_col_heading: '按信号强度排名',
    drawer_title: '跟踪控制',
    section_add_topic: '添加话题', add_topic_placeholder: '添加话题...', btn_add: '添加',
    section_smarter: '智能监控',
    lbl_industry: '行业', ph_industry: '医疗...',
    lbl_brand: '品牌', ph_brand: 'Nike, Pfizer...',
    lbl_role: '角色', ph_role: 'CMO, VP...',
    lbl_priority: '优先事项', ph_priority: '自动化...',
    lbl_headline_lang: '标题语言',
    recos_analyzing: 'AI分析中...', btn_generate: '生成',
    section_daily: '监控节奏', monitor_lbl: '扫描计划', monitor_off: '关闭',
    section_radar_brief: '雷达简报',
    lbl_email: '您的邮箱', ph_email: 'your@email.cn',
    lbl_topics_include: '包含的话题',
    lbl_frequency: '频率', lbl_format: '格式',
    freq_one: '每周 1 次简报', freq_three: '每周 3 次简报', freq_five: '每周 5 次简报',
    fmt_brief: '简短', fmt_detailed: '详细', fmt_narrative: '叙述式', fmt_rawintel: '原始情报',
    btn_preview_brief: '预览简报',
    sched_days: '投递日期', sched_time: '投递时间', btn_confirm_sched: '确认计划',
    day_mon: '周一', day_tue: '周二', day_wed: '周三', day_thu: '周四',
    day_fri: '周五', day_sat: '周六', day_sun: '周日',
    modal_copy: '复制到剪贴板', modal_export: '导出 ↓',
    export_copy_md: '复制为Markdown', export_dl_md: '下载.md文件', export_pdf: '打印 / 另存为PDF',
    modal_send: '发送至模型 →', modal_schedule: '安排雷达简报',
    pp_label: '强力提示词', pp_generating: '正在生成提示词…',
    pp_strategic: '战略分析', pp_competitive: '竞争影响',
    pp_monitor: '监测重点', pp_open_model: '在AI模型中打开',
    pp_intel_brief: '情报简报', pp_btn: 'AI提示词',
    pp_header: '强力提示词', pp_exec_summary: '生成执行摘要',
    fib_open: '打开', fib_track: '追踪', fib_brief: '简报',
    action_open_article: '打开完整文章', action_track_signal: '追踪此信号',
    action_gen_brief: '生成情报简报',
    eyebrow_analyze: '分析', stat_articles: '篇文章', stat_beliefs: '条假设',
    belief_lens_for_you: '对你',
    stat_scanned: '已扫描', btn_brief: '简报', btn_scanning: '扫描中...',
    btn_scan_all: '扫描全部', btn_home: '← 主页', btn_topic_controls: '话题管理',
    col_signals: '支持信号', col_results: '条结果', col_beliefs_ranked: '按置信度排名',
    btn_edit: '编辑', btn_remove: '删除', topic_not_scanned: '尚未扫描',
    ph_fetching: '正在获取文章...', ph_no_articles: '暂无文章 — 点击扫描',
    ph_gen_beliefs: '正在生成假设...', ph_beliefs_first: '首次扫描时生成假设',
    empty_topic_title: '选择话题', empty_topic_desc: '从侧边栏选择追踪的话题。',
    edit_save_rescan: '保存并重新扫描', edit_cancel: '取消', btn_scanning_all: '扫描中...',
  },

  ko: {
    btn_scan: '검색', nav_tracked_topics: '추적 중인 주제',
    persona_executive: '보기：임원', persona_analyst: '보기：분석가',
    persona_strategist: '보기：전략가', persona_full: '보기：전체 맥락',
    search_placeholder: "검색 (예: '로보틱스', '의료')...",
    section_tag_monitor: '모니터', section_tag_analyze: '분석',
    feed_section_title: '신호 피드',
    feed_sort_relevant: '관련성', feed_sort_newest: '최신순', feed_sort_confidence: '신뢰도',
    chip_top_news: '주요 뉴스', chip_gen_ai: '생성형 AI', chip_agents: '에이전트',
    chip_robotics: '로보틱스', chip_policy: '정책',
    sidebar_section_title: '선택한 인사이트',
    insight_empty_title: '신호 선택',
    insight_empty_desc: '피드의 항목을 클릭하여 상세 분석 보기',
    insight_metric_confidence: '신뢰도', insight_metric_timeline: '타임라인',
    insight_section_why: '왜 중요한가', insight_section_actions: '빠른 실행',
    insight_section_top: '주요 실행',
    insight_toggle_briefing: '브리핑', insight_toggle_disruptor: '파괴자',
    modal_page_brief_title: '페이지 브리프',
    brief_loading_status: '인터랙티브 브리프 생성 중...', brief_loading_sub: '피드 항목 읽는 중',
    btn_copy_analysis: '클립보드에 복사', btn_send_to_model: '모델에 전송',
    modal_countermove_title: '대응 전략',
    countermove_desc: '시장 신호를 분석하여 전략적 기회를 파악합니다. 관계자를 정의하세요：',
    countermove_label_you: '당신의 조직', countermove_label_them: '경쟁사',
    btn_activate_countermove: '대응 전략 분석',
    modal_disruptor_title: '⚡ 파괴자',
    disruptor_loading_status: '신호 메커니즘 분석 중…', disruptor_loading_sub: '산업 횡단 지도 구축 중',
    btn_copy_disruptor: '클립보드에 복사',
    modal_history_title: '놓친 보고서', modal_briefing_title: '저장된 항목',
    sidebar_count_label: '추적 중인\n주제', sidebar_col_heading: '신호 강도별 순위',
    drawer_title: '추적 제어',
    section_add_topic: '주제 추가', add_topic_placeholder: '주제 추가...', btn_add: '추가',
    section_smarter: '스마트 모니터링',
    lbl_industry: '산업', ph_industry: '의료...',
    lbl_brand: '브랜드', ph_brand: 'Nike, Pfizer...',
    lbl_role: '역할', ph_role: 'CMO, VP...',
    lbl_priority: '우선순위', ph_priority: '자동화...',
    lbl_headline_lang: '헤드라인 언어',
    recos_analyzing: 'AI 분석 중...', btn_generate: '생성',
    section_daily: '모니터링 리듬', monitor_lbl: '스캔 일정', monitor_off: '꺼짐',
    section_radar_brief: '레이더 브리프',
    lbl_email: '이메일 주소', ph_email: 'your@email.kr',
    lbl_topics_include: '포함할 주제',
    lbl_frequency: '빈도', lbl_format: '형식',
    freq_one: '주 1회 브리프', freq_three: '주 3회 브리프', freq_five: '주 5회 브리프',
    fmt_brief: '간략', fmt_detailed: '상세', fmt_narrative: '서술형', fmt_rawintel: '원시 인텔',
    btn_preview_brief: '브리프 미리보기',
    sched_days: '배송 요일', sched_time: '배송 시간', btn_confirm_sched: '일정 확인',
    day_mon: '월', day_tue: '화', day_wed: '수', day_thu: '목',
    day_fri: '금', day_sat: '토', day_sun: '일',
    modal_copy: '클립보드에 복사', modal_export: '내보내기 ↓',
    export_copy_md: 'Markdown으로 복사', export_dl_md: '.md 파일 다운로드', export_pdf: '인쇄 / PDF로 저장',
    modal_send: '모델에 전송 →', modal_schedule: '레이더 브리프 예약',
    pp_label: '파워 프롬프트', pp_generating: '프롬프트 생성 중…',
    pp_strategic: '전략 분석', pp_competitive: '경쟁 영향',
    pp_monitor: '모니터링 항목', pp_open_model: 'AI 모델에서 열기',
    pp_intel_brief: '인텔리전스 브리프', pp_btn: 'AI 프롬프트',
    pp_header: '파워 프롬프트', pp_exec_summary: '임원 요약 생성',
    fib_open: '열기', fib_track: '추적', fib_brief: '브리프',
    action_open_article: '전체 기사 열기', action_track_signal: '이 신호 추적',
    action_gen_brief: '인텔리전스 브리프 생성',
    eyebrow_analyze: '분석', stat_articles: '기사', stat_beliefs: '가설',
    belief_lens_for_you: '당신에게',
    stat_scanned: '스캔됨', btn_brief: '브리프', btn_scanning: '스캔 중...',
    btn_scan_all: '전체 스캔', btn_home: '← 홈', btn_topic_controls: '주제 관리',
    col_signals: '지원 신호', col_results: '결과', col_beliefs_ranked: '신뢰도별 순위',
    btn_edit: '편집', btn_remove: '삭제', topic_not_scanned: '아직 스캔되지 않음',
    ph_fetching: '기사 가져오는 중...', ph_no_articles: '기사 없음 — 스캔 클릭',
    ph_gen_beliefs: '가설 생성 중...', ph_beliefs_first: '첫 번째 스캔에서 가설 생성됨',
    empty_topic_title: '주제 선택', empty_topic_desc: '사이드바에서 추적 중인 주제를 선택하세요.',
    edit_save_rescan: '저장 및 재스캔', edit_cancel: '취소', btn_scanning_all: '스캔 중...',
  },

  ar: {
    btn_scan: 'بحث', nav_tracked_topics: 'المواضيع المتابعة',
    persona_executive: 'عرض: تنفيذي', persona_analyst: 'عرض: محلل',
    persona_strategist: 'عرض: استراتيجي', persona_full: 'عرض: السياق الكامل',
    search_placeholder: "بحث (مثال: 'الروبوتات'، 'الرعاية الصحية')...",
    section_tag_monitor: 'رصد', section_tag_analyze: 'تحليل',
    feed_section_title: 'تغذية الإشارات',
    feed_sort_relevant: 'الأكثر صلة', feed_sort_newest: 'الأحدث', feed_sort_confidence: 'الثقة',
    chip_top_news: 'أبرز الأخبار', chip_gen_ai: 'الذكاء الاصطناعي التوليدي', chip_agents: 'الوكلاء',
    chip_robotics: 'الروبوتات', chip_policy: 'السياسة',
    sidebar_section_title: 'التحليل المحدد',
    insight_empty_title: 'اختر إشارة',
    insight_empty_desc: 'انقر على أي عنصر في التغذية لرؤية تحليله',
    insight_metric_confidence: 'الثقة', insight_metric_timeline: 'الإطار الزمني',
    insight_section_why: 'لماذا يهم', insight_section_actions: 'إجراءات سريعة',
    insight_section_top: 'الإجراءات الرئيسية',
    insight_toggle_briefing: 'إحاطة', insight_toggle_disruptor: 'مُعطِّل',
    modal_page_brief_title: 'إحاطة الصفحة',
    brief_loading_status: 'جارٍ إنشاء الإحاطة التفاعلية...', brief_loading_sub: 'قراءة عناصر التغذية',
    btn_copy_analysis: 'نسخ إلى الحافظة', btn_send_to_model: 'إرسال إلى النموذج',
    modal_countermove_title: 'تحركات مضادة',
    countermove_desc: 'سأحلل إشارات السوق لتحديد الفرص الاستراتيجية. حدّد الأطراف:',
    countermove_label_you: 'كيانك', countermove_label_them: 'المنافس',
    btn_activate_countermove: 'تحليل التحركات المضادة',
    modal_disruptor_title: '⚡ مُعطِّل',
    disruptor_loading_status: 'جارٍ تحليل آليات الإشارة…', disruptor_loading_sub: 'بناء خريطة متعددة الصناعات',
    btn_copy_disruptor: 'نسخ إلى الحافظة',
    modal_history_title: 'التقارير الفائتة', modal_briefing_title: 'العناصر المحفوظة',
    sidebar_count_label: 'المواضيع\nالمتابعة', sidebar_col_heading: 'مرتبة حسب قوة الإشارة',
    drawer_title: 'عناصر تحكم التتبع',
    section_add_topic: 'إضافة موضوع', add_topic_placeholder: 'إضافة موضوع...', btn_add: 'إضافة',
    section_smarter: 'مراقبة ذكية',
    lbl_industry: 'الصناعة', ph_industry: 'الرعاية الصحية...',
    lbl_brand: 'العلامة التجارية', ph_brand: 'Nike, Pfizer...',
    lbl_role: 'الدور', ph_role: 'CMO, VP...',
    lbl_priority: 'الأولوية', ph_priority: 'الأتمتة...',
    lbl_headline_lang: 'لغة العناوين',
    recos_analyzing: 'الذكاء الاصطناعي يحلل...', btn_generate: 'إنشاء',
    section_daily: 'وتيرة المراقبة', monitor_lbl: 'جدول المسح', monitor_off: 'معطل',
    section_radar_brief: 'إحاطة رادار',
    lbl_email: 'بريدك الإلكتروني', ph_email: 'your@email.com',
    lbl_topics_include: 'المواضيع المراد تضمينها',
    lbl_frequency: 'التكرار', lbl_format: 'الصيغة',
    freq_one: 'إحاطة واحدة / أسبوع', freq_three: '3 إحاطات / أسبوع', freq_five: '5 إحاطات / أسبوع',
    fmt_brief: 'موجز', fmt_detailed: 'تفصيلي', fmt_narrative: 'سردي', fmt_rawintel: 'معلومات خام',
    btn_preview_brief: 'معاينة الإحاطة',
    sched_days: 'أيام التسليم', sched_time: 'وقت التسليم', btn_confirm_sched: 'تأكيد الجدول',
    day_mon: 'الاثنين', day_tue: 'الثلاثاء', day_wed: 'الأربعاء', day_thu: 'الخميس',
    day_fri: 'الجمعة', day_sat: 'السبت', day_sun: 'الأحد',
    modal_copy: 'نسخ إلى الحافظة', modal_export: 'تصدير ↓',
    export_copy_md: 'نسخ كـ Markdown', export_dl_md: 'تنزيل ملف .md', export_pdf: 'طباعة / حفظ كـ PDF',
    modal_send: 'إرسال إلى النموذج →', modal_schedule: 'جدولة إحاطة رادار',
    pp_label: 'أوامر متقدمة', pp_generating: 'جارٍ إنشاء الأوامر…',
    pp_strategic: 'التحليل الاستراتيجي', pp_competitive: 'التداعيات التنافسية',
    pp_monitor: 'ما يجب مراقبته', pp_open_model: 'فتح في نموذج الذكاء الاصطناعي',
    pp_intel_brief: 'إحاطة استخباراتية', pp_btn: 'أمر ذكاء اصطناعي',
    pp_header: 'أوامر متقدمة', pp_exec_summary: 'إنشاء ملخص تنفيذي',
    fib_open: 'فتح', fib_track: 'تتبع', fib_brief: 'إحاطة',
    action_open_article: 'فتح المقال كاملاً', action_track_signal: 'تتبع هذه الإشارة',
    action_gen_brief: 'إنشاء إحاطة استخباراتية',
    eyebrow_analyze: 'تحليل', stat_articles: 'مقالات', stat_beliefs: 'معتقدات',
    belief_lens_for_you: 'لك',
    stat_scanned: 'تم المسح', btn_brief: 'إحاطة', btn_scanning: 'جارٍ المسح...',
    btn_scan_all: 'مسح الكل', btn_home: '← الرئيسية', btn_topic_controls: 'إعدادات الموضوع',
    col_signals: 'إشارات داعمة', col_results: 'نتائج', col_beliefs_ranked: 'مرتبة حسب الثقة',
    btn_edit: 'تعديل', btn_remove: 'حذف', topic_not_scanned: 'لم يُمسح بعد',
    ph_fetching: 'جارٍ تحميل المقالات...', ph_no_articles: 'لا توجد مقالات — انقر مسح',
    ph_gen_beliefs: 'جارٍ إنشاء المعتقدات...', ph_beliefs_first: 'المعتقدات تُنشأ في أول مسح',
    empty_topic_title: 'اختر موضوعاً', empty_topic_desc: 'اختر موضوعاً متابعاً من الشريط الجانبي.',
    edit_save_rescan: 'حفظ وإعادة المسح', edit_cancel: 'إلغاء', btn_scanning_all: 'جارٍ المسح...',
  },

  nl: {
    btn_scan: 'Zoeken', nav_tracked_topics: 'Gevolgde Onderwerpen',
    persona_executive: 'Beeld als: Directeur', persona_analyst: 'Beeld als: Analist',
    persona_strategist: 'Beeld als: Strateeg', persona_full: 'Beeld als: Volledige Context',
    search_placeholder: "Zoeken (bijv. 'Robotica', 'Zorg')...",
    section_tag_monitor: 'MONITOREN', section_tag_analyze: 'ANALYSEREN',
    feed_section_title: 'Signaalfeed',
    feed_sort_relevant: 'Relevant', feed_sort_newest: 'Nieuwste', feed_sort_confidence: 'Betrouwbaarheid',
    chip_top_news: 'Topnieuws', chip_gen_ai: 'Generatieve AI', chip_agents: 'Agenten',
    chip_robotics: 'Robotica', chip_policy: 'Beleid',
    sidebar_section_title: 'Geselecteerde Inzicht',
    insight_empty_title: 'Selecteer een Signaal',
    insight_empty_desc: 'Klik op een item in de feed voor de gedetailleerde analyse',
    insight_metric_confidence: 'BETROUWBAARHEID', insight_metric_timeline: 'TIJDLIJN',
    insight_section_why: 'WAAROM HET BELANGRIJK IS', insight_section_actions: 'SNELLE ACTIES',
    insight_section_top: 'BELANGRIJKSTE ACTIES',
    insight_toggle_briefing: 'Briefing', insight_toggle_disruptor: 'Disruptor',
    modal_page_brief_title: 'Pagina-briefing',
    brief_loading_status: 'Interactieve briefing genereren...', brief_loading_sub: 'Feed-items worden gelezen',
    btn_copy_analysis: 'Kopiëren naar Klembord', btn_send_to_model: 'Sturen naar Model',
    modal_countermove_title: 'Tegenzet',
    countermove_desc: 'Ik analyseer marktsignalen om strategische kansen te identificeren. Definieer de spelers:',
    countermove_label_you: 'JOUW ENTITEIT', countermove_label_them: 'DE CONCURRENT',
    btn_activate_countermove: 'Tegenzetten Analyseren',
    modal_disruptor_title: '⚡ Disruptor',
    disruptor_loading_status: 'Signaalmechanismen analyseren…', disruptor_loading_sub: 'Sectorbrede kaart samenstellen',
    btn_copy_disruptor: 'Kopiëren naar Klembord',
    modal_history_title: 'Gemiste Rapporten', modal_briefing_title: 'Opgeslagen Items',
    sidebar_count_label: 'Gevolgde\nOnderwerpen', sidebar_col_heading: 'Gerangschikt op signaalsterkte',
    drawer_title: 'Trackingbediening',
    section_add_topic: 'Onderwerp Toevoegen', add_topic_placeholder: 'Onderwerp toevoegen...', btn_add: 'Toevoegen',
    section_smarter: 'Slim monitoren',
    lbl_industry: 'Sector', ph_industry: 'Zorg...',
    lbl_brand: 'Merk', ph_brand: 'Nike, Pfizer...',
    lbl_role: 'Rol', ph_role: 'CMO, VP...',
    lbl_priority: 'Prioriteit', ph_priority: 'Automatisering...',
    lbl_headline_lang: 'Koptekst Taal',
    recos_analyzing: 'AI Analyseert...', btn_generate: 'Genereren',
    section_daily: 'Monitoringritme', monitor_lbl: 'Scanschema', monitor_off: 'Inactief',
    section_radar_brief: 'Radar-briefing',
    lbl_email: 'Jouw e-mail', ph_email: 'jij@voorbeeld.nl',
    lbl_topics_include: 'Onderwerpen om op te nemen',
    lbl_frequency: 'Frequentie', lbl_format: 'Formaat',
    freq_one: '1 brief / week', freq_three: '3 briefs / week', freq_five: '5 briefs / week',
    fmt_brief: 'Beknopt', fmt_detailed: 'Gedetailleerd', fmt_narrative: 'Verhalend', fmt_rawintel: 'Ruwe Intel',
    btn_preview_brief: 'Voorbeeld briefing',
    sched_days: 'Bezorgdagen', sched_time: 'Bezorgtijd', btn_confirm_sched: 'Schema Bevestigen',
    day_mon: 'Ma', day_tue: 'Di', day_wed: 'Wo', day_thu: 'Do',
    day_fri: 'Vr', day_sat: 'Za', day_sun: 'Zo',
    modal_copy: 'Kopiëren naar Klembord', modal_export: 'Exporteren ↓',
    export_copy_md: 'Kopiëren als Markdown', export_dl_md: '.md-bestand downloaden', export_pdf: 'Afdrukken / Opslaan als PDF',
    modal_send: 'Sturen naar Model →', modal_schedule: 'Radar-briefing Plannen',
    pp_label: 'Power-prompts', pp_generating: 'Prompts genereren…',
    pp_strategic: 'Strategische Analyse', pp_competitive: 'Concurrentiële Implicaties',
    pp_monitor: 'Wat te Monitoren', pp_open_model: 'Openen in uw AI-model',
    pp_intel_brief: 'Inlichtingenbriefing', pp_btn: 'AI-prompt',
    pp_header: 'POWER-PROMPTS', pp_exec_summary: 'Directiesamenvatting Genereren',
    fib_open: 'Openen', fib_track: 'Volgen', fib_brief: 'Briefing',
    action_open_article: 'Volledig artikel openen', action_track_signal: 'Dit signaal volgen',
    action_gen_brief: 'Inlichtingenbriefing genereren',
    eyebrow_analyze: 'Analyseren', stat_articles: 'artikelen', stat_beliefs: 'overtuigingen',
    belief_lens_for_you: 'Voor jou',
    stat_scanned: 'Gescand', btn_brief: 'Briefing', btn_scanning: 'Scannen...',
    btn_scan_all: 'Alles scannen', btn_home: '← Home', btn_topic_controls: 'Onderwerp instellen',
    col_signals: 'Ondersteunende signalen', col_results: 'resultaten', col_beliefs_ranked: 'gerangschikt op betrouwbaarheid',
    btn_edit: 'Bewerken', btn_remove: 'Verwijderen', topic_not_scanned: 'Nog niet gescand',
    ph_fetching: 'Artikelen ophalen...', ph_no_articles: 'Geen artikelen — klik Scannen',
    ph_gen_beliefs: 'Overtuigingen genereren...', ph_beliefs_first: 'Overtuigingen gegenereerd bij eerste scan',
    empty_topic_title: 'Selecteer een onderwerp', empty_topic_desc: 'Kies een gevolgd onderwerp uit de zijbalk.',
    edit_save_rescan: 'Opslaan & Opnieuw scannen', edit_cancel: 'Annuleren', btn_scanning_all: 'Scannen...',
  },

  ru: {
    btn_scan: 'Поиск', nav_tracked_topics: 'Отслеживаемые темы',
    persona_executive: 'Вид: Руководитель', persona_analyst: 'Вид: Аналитик',
    persona_strategist: 'Вид: Стратег', persona_full: 'Вид: Полный контекст',
    search_placeholder: "Поиск (например: 'Робототехника', 'Здравоохранение')...",
    section_tag_monitor: 'МОНИТОРИНГ', section_tag_analyze: 'АНАЛИЗ',
    feed_section_title: 'Лента сигналов',
    feed_sort_relevant: 'Релевантные', feed_sort_newest: 'Новейшие', feed_sort_confidence: 'Уверенность',
    chip_top_news: 'Топ новости', chip_gen_ai: 'Генеративный ИИ', chip_agents: 'Агенты',
    chip_robotics: 'Робототехника', chip_policy: 'Политика',
    sidebar_section_title: 'Выбранный анализ',
    insight_empty_title: 'Выберите сигнал',
    insight_empty_desc: 'Нажмите на элемент в ленте для детального анализа',
    insight_metric_confidence: 'УВЕРЕННОСТЬ', insight_metric_timeline: 'ВРЕМЕННЫЕ РАМКИ',
    insight_section_why: 'ПОЧЕМУ ЭТО ВАЖНО', insight_section_actions: 'БЫСТРЫЕ ДЕЙСТВИЯ',
    insight_section_top: 'ОСНОВНЫЕ ДЕЙСТВИЯ',
    insight_toggle_briefing: 'Сводка', insight_toggle_disruptor: 'Нарушитель',
    modal_page_brief_title: 'Обзор страницы',
    brief_loading_status: 'Создание интерактивного обзора...', brief_loading_sub: 'Чтение элементов ленты',
    btn_copy_analysis: 'Скопировать в буфер', btn_send_to_model: 'Отправить в модель',
    modal_countermove_title: 'Контрмеры',
    countermove_desc: 'Я проанализирую рыночные сигналы для выявления стратегических возможностей. Определите участников:',
    countermove_label_you: 'ВАША ОРГАНИЗАЦИЯ', countermove_label_them: 'КОНКУРЕНТ',
    btn_activate_countermove: 'Анализировать контрмеры',
    modal_disruptor_title: '⚡ Нарушитель',
    disruptor_loading_status: 'Анализ механизмов сигнала…', disruptor_loading_sub: 'Построение межотраслевой карты',
    btn_copy_disruptor: 'Скопировать в буфер',
    modal_history_title: 'Пропущенные отчёты', modal_briefing_title: 'Сохранённые элементы',
    sidebar_count_label: 'Отслеживаемые\nтемы', sidebar_col_heading: 'Отсортировано по силе сигнала',
    drawer_title: 'Панель отслеживания',
    section_add_topic: 'Добавить тему', add_topic_placeholder: 'Добавить тему...', btn_add: 'Добавить',
    section_smarter: 'Умный мониторинг',
    lbl_industry: 'Отрасль', ph_industry: 'Здравоохранение...',
    lbl_brand: 'Бренд', ph_brand: 'Nike, Pfizer...',
    lbl_role: 'Роль', ph_role: 'CMO, VP...',
    lbl_priority: 'Приоритет', ph_priority: 'Автоматизация...',
    lbl_headline_lang: 'Язык заголовков',
    recos_analyzing: 'ИИ анализирует...', btn_generate: 'Создать',
    section_daily: 'Ритм мониторинга', monitor_lbl: 'Расписание сканирования', monitor_off: 'Неактивно',
    section_radar_brief: 'Обзор радара',
    lbl_email: 'Ваш email', ph_email: 'your@email.ru',
    lbl_topics_include: 'Темы для включения',
    lbl_frequency: 'Частота', lbl_format: 'Формат',
    freq_one: '1 бриф / неделя', freq_three: '3 брифа / неделя', freq_five: '5 брифов / неделя',
    fmt_brief: 'Краткий', fmt_detailed: 'Подробный', fmt_narrative: 'Нарративный', fmt_rawintel: 'Сырые данные',
    btn_preview_brief: 'Предварительный просмотр',
    sched_days: 'Дни доставки', sched_time: 'Время доставки', btn_confirm_sched: 'Подтвердить расписание',
    day_mon: 'Пн', day_tue: 'Вт', day_wed: 'Ср', day_thu: 'Чт',
    day_fri: 'Пт', day_sat: 'Сб', day_sun: 'Вс',
    modal_copy: 'Скопировать в буфер', modal_export: 'Экспорт ↓',
    export_copy_md: 'Копировать как Markdown', export_dl_md: 'Скачать .md файл', export_pdf: 'Печать / Сохранить как PDF',
    modal_send: 'Отправить в модель →', modal_schedule: 'Запланировать обзор радара',
    pp_label: 'Умные Запросы', pp_generating: 'Генерация запросов…',
    pp_strategic: 'Стратегический анализ', pp_competitive: 'Конкурентные последствия',
    pp_monitor: 'Что отслеживать', pp_open_model: 'Открыть в ИИ-модели',
    pp_intel_brief: 'Разведывательный отчёт', pp_btn: 'ИИ-запрос',
    pp_header: 'УМНЫЕ ЗАПРОСЫ', pp_exec_summary: 'Создать исполнительное резюме',
    fib_open: 'Открыть', fib_track: 'Отслеживать', fib_brief: 'Отчёт',
    action_open_article: 'Открыть полную статью', action_track_signal: 'Отслеживать этот сигнал',
    action_gen_brief: 'Создать разведывательный отчёт',
    eyebrow_analyze: 'Анализ', stat_articles: 'статей', stat_beliefs: 'убеждений',
    belief_lens_for_you: 'Для вас',
    stat_scanned: 'Просканировано', btn_brief: 'Отчёт', btn_scanning: 'Сканирование...',
    btn_scan_all: 'Сканировать всё', btn_home: '← Главная', btn_topic_controls: 'Настройки темы',
    col_signals: 'Поддерживающие сигналы', col_results: 'результатов', col_beliefs_ranked: 'отсортировано по уверенности',
    btn_edit: 'Изменить', btn_remove: 'Удалить', topic_not_scanned: 'Ещё не просканировано',
    ph_fetching: 'Загрузка статей...', ph_no_articles: 'Нет статей — нажмите Сканировать',
    ph_gen_beliefs: 'Генерация убеждений...', ph_beliefs_first: 'Убеждения сгенерированы при первом сканировании',
    empty_topic_title: 'Выберите тему', empty_topic_desc: 'Выберите отслеживаемую тему из боковой панели.',
    edit_save_rescan: 'Сохранить и пересканировать', edit_cancel: 'Отмена', btn_scanning_all: 'Сканирование...',
  },

  hi: {
    btn_scan: 'खोजें', nav_tracked_topics: 'ट्रैक किए गए विषय',
    persona_executive: 'देखें: कार्यकारी', persona_analyst: 'देखें: विश्लेषक',
    persona_strategist: 'देखें: रणनीतिकार', persona_full: 'देखें: पूर्ण संदर्भ',
    search_placeholder: "खोजें (जैसे: 'रोबोटिक्स', 'स्वास्थ्य')...",
    section_tag_monitor: 'निगरानी', section_tag_analyze: 'विश्लेषण',
    feed_section_title: 'सिग्नल फ़ीड',
    feed_sort_relevant: 'प्रासंगिक', feed_sort_newest: 'नवीनतम', feed_sort_confidence: 'विश्वास',
    chip_top_news: 'प्रमुख समाचार', chip_gen_ai: 'जनरेटिव AI', chip_agents: 'एजेंट',
    chip_robotics: 'रोबोटिक्स', chip_policy: 'नीति',
    sidebar_section_title: 'चयनित अंतर्दृष्टि',
    insight_empty_title: 'एक सिग्नल चुनें',
    insight_empty_desc: 'विस्तृत विश्लेषण देखने के लिए फ़ीड में किसी आइटम पर क्लिक करें',
    insight_metric_confidence: 'विश्वास', insight_metric_timeline: 'समय-सीमा',
    insight_section_why: 'क्यों महत्वपूर्ण है', insight_section_actions: 'त्वरित क्रियाएँ',
    insight_section_top: 'मुख्य क्रियाएँ',
    insight_toggle_briefing: 'ब्रीफिंग', insight_toggle_disruptor: 'व्यवधानकर्ता',
    modal_page_brief_title: 'पेज ब्रीफ',
    brief_loading_status: 'इंटरैक्टिव ब्रीफ तैयार हो रहा है...', brief_loading_sub: 'फ़ीड आइटम पढ़े जा रहे हैं',
    btn_copy_analysis: 'क्लिपबोर्ड पर कॉपी करें', btn_send_to_model: 'मॉडल को भेजें',
    modal_countermove_title: 'जवाबी कदम',
    countermove_desc: 'मैं रणनीतिक अवसर खोजने के लिए बाज़ार संकेतों का विश्लेषण करूँगा। खिलाड़ियों को परिभाषित करें:',
    countermove_label_you: 'आपकी संस्था', countermove_label_them: 'प्रतिस्पर्धी',
    btn_activate_countermove: 'जवाबी कदमों का विश्लेषण',
    modal_disruptor_title: '⚡ व्यवधानकर्ता',
    disruptor_loading_status: 'सिग्नल तंत्र का विश्लेषण हो रहा है…', disruptor_loading_sub: 'क्रॉस-इंडस्ट्री मैप बनाया जा रहा है',
    btn_copy_disruptor: 'क्लिपबोर्ड पर कॉपी करें',
    modal_history_title: 'छूटी हुई रिपोर्ट', modal_briefing_title: 'सहेजे गए आइटम',
    sidebar_count_label: 'ट्रैक किए गए\nविषय', sidebar_col_heading: 'सिग्नल शक्ति के अनुसार क्रमबद्ध',
    drawer_title: 'ट्रैकिंग नियंत्रण',
    section_add_topic: 'विषय जोड़ें', add_topic_placeholder: 'विषय जोड़ें...', btn_add: 'जोड़ें',
    section_smarter: 'स्मार्ट निगरानी',
    lbl_industry: 'उद्योग', ph_industry: 'स्वास्थ्य...',
    lbl_brand: 'ब्रांड', ph_brand: 'Nike, Pfizer...',
    lbl_role: 'भूमिका', ph_role: 'CMO, VP...',
    lbl_priority: 'प्राथमिकता', ph_priority: 'स्वचालन...',
    lbl_headline_lang: 'शीर्षक भाषा',
    recos_analyzing: 'AI विश्लेषण कर रहा है...', btn_generate: 'उत्पन्न करें',
    section_daily: 'निगरानी लय', monitor_lbl: 'स्कैन शेड्यूल', monitor_off: 'बंद',
    section_radar_brief: 'रेडार ब्रीफ',
    lbl_email: 'आपका ईमेल', ph_email: 'your@email.in',
    lbl_topics_include: 'शामिल करने के विषय',
    lbl_frequency: 'आवृत्ति', lbl_format: 'प्रारूप',
    freq_one: '1 ब्रीफ / सप्ताह', freq_three: '3 ब्रीफ / सप्ताह', freq_five: '5 ब्रीफ / सप्ताह',
    fmt_brief: 'संक्षिप्त', fmt_detailed: 'विस्तृत', fmt_narrative: 'आख्यान', fmt_rawintel: 'कच्ची जानकारी',
    btn_preview_brief: 'ब्रीफ का पूर्वावलोकन',
    sched_days: 'डिलीवरी दिन', sched_time: 'डिलीवरी समय', btn_confirm_sched: 'शेड्यूल की पुष्टि करें',
    day_mon: 'सोम', day_tue: 'मंगल', day_wed: 'बुध', day_thu: 'गुरु',
    day_fri: 'शुक्र', day_sat: 'शनि', day_sun: 'रवि',
    modal_copy: 'क्लिपबोर्ड पर कॉपी करें', modal_export: 'निर्यात ↓',
    export_copy_md: 'Markdown के रूप में कॉपी करें', export_dl_md: '.md फ़ाइल डाउनलोड करें', export_pdf: 'प्रिंट करें / PDF के रूप में सहेजें',
    modal_send: 'मॉडल को भेजें →', modal_schedule: 'रेडार ब्रीफ शेड्यूल करें',
    pp_label: 'पावर प्रॉम्प्ट', pp_generating: 'प्रॉम्प्ट बनाए जा रहे हैं…',
    pp_strategic: 'रणनीतिक विश्लेषण', pp_competitive: 'प्रतिस्पर्धात्मक प्रभाव',
    pp_monitor: 'क्या निगरानी करें', pp_open_model: 'AI मॉडल में खोलें',
    pp_intel_brief: 'खुफिया ब्रीफ', pp_btn: 'AI प्रॉम्प्ट',
    pp_header: 'पावर प्रॉम्प्ट', pp_exec_summary: 'कार्यकारी सारांश बनाएं',
    fib_open: 'खोलें', fib_track: 'ट्रैक', fib_brief: 'ब्रीफ',
    action_open_article: 'पूरा लेख खोलें', action_track_signal: 'इस सिग्नल को ट्रैक करें',
    action_gen_brief: 'खुफिया ब्रीफ बनाएं',
    eyebrow_analyze: 'विश्लेषण', stat_articles: 'लेख', stat_beliefs: 'विश्वास',
    belief_lens_for_you: 'आपके लिए',
    stat_scanned: 'स्कैन किया', btn_brief: 'ब्रीफ', btn_scanning: 'स्कैन हो रहा है...',
    btn_scan_all: 'सभी स्कैन करें', btn_home: '← होम', btn_topic_controls: 'विषय नियंत्रण',
    col_signals: 'सहायक संकेत', col_results: 'परिणाम', col_beliefs_ranked: 'विश्वास के अनुसार क्रमबद्ध',
    btn_edit: 'संपादित करें', btn_remove: 'हटाएं', topic_not_scanned: 'अभी तक स्कैन नहीं',
    ph_fetching: 'लेख प्राप्त हो रहे हैं...', ph_no_articles: 'कोई लेख नहीं — स्कैन करें',
    ph_gen_beliefs: 'विश्वास बनाए जा रहे हैं...', ph_beliefs_first: 'पहले स्कैन पर विश्वास बनाए जाते हैं',
    empty_topic_title: 'एक विषय चुनें', empty_topic_desc: 'साइडबार से ट्रैक किया गया विषय चुनें।',
    edit_save_rescan: 'सहेजें और पुनः स्कैन करें', edit_cancel: 'रद्द करें', btn_scanning_all: 'स्कैन हो रहा है...',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// applyUITranslations(lang)
// Instantly translates all static HTML elements using the table above.
// No API call needed. Safe to call on every language change.
// ─────────────────────────────────────────────────────────────────────────────
export function applyUITranslations(lang) {
  const t = UI_TRANSLATIONS[lang];
  if (!t) return; // unknown lang — leave English as-is

  const q   = (s) => document.querySelector(s);
  const qa  = (s) => [...document.querySelectorAll(s)];

  // Set textContent and mark as translated (skipped by API walker)
  const set = (el, key) => {
    if (!el || !t[key]) return;
    if (!el.dataset.originalText) el.dataset.originalText = el.textContent.trim();
    el.textContent = t[key];
    el.dataset.translated = lang;
  };
  const sel  = (selector, key) => set(q(selector), key);
  const selN = (selector, idx, key) => set(qa(selector)[idx], key);

  // Set placeholder attribute (inputs, textareas)
  const ph = (selector, key) => {
    const el = q(selector);
    if (el && t[key]) el.placeholder = t[key];
  };

  // Set a text node only — preserves child elements (icons, badges)
  const setNode = (selector, key) => {
    const el = q(selector);
    if (!el || !t[key]) return;
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        node.textContent = t[key] + ' ';
        break;
      }
    }
  };

  // Set <option> text by value within a <select>
  const opt = (selectSel, value, key) => {
    const el = q(`${selectSel} option[value="${value}"]`);
    if (el && t[key]) el.textContent = t[key];
  };

  // ── DASHBOARD ──────────────────────────────────────────────────────────────
  sel('#btn-scan', 'btn_scan');
  ph('#smart-search', 'search_placeholder');

  // Nav link — has a .pro-pill child badge, preserve it
  setNode('.premium-nav-btn', 'nav_tracked_topics');

  // Persona select options
  opt('#persona-selector', 'executive', 'persona_executive');
  opt('#persona-selector', 'analyst',   'persona_analyst');
  opt('#persona-selector', 'strategist','persona_strategist');
  opt('#persona-selector', 'full',      'persona_full');

  // Feed
  sel('.feed-sort-tab[data-sort="relevant"]',   'feed_sort_relevant');
  sel('.feed-sort-tab[data-sort="newest"]',     'feed_sort_newest');
  sel('.feed-sort-tab[data-sort="confidence"]', 'feed_sort_confidence');
  sel('.chip[data-q="Artificial Intelligence Trends"]', 'chip_top_news');
  sel('.chip[data-q="Generative AI"]',  'chip_gen_ai');
  sel('.chip[data-q="AI Agents"]',      'chip_agents');
  sel('.chip[data-q="Robotics"]',       'chip_robotics');
  sel('.chip[data-q="AI Regulation"]',  'chip_policy');

  // Insight panel — empty state
  sel('#insight-empty .insight-empty-title', 'insight_empty_title');
  sel('#insight-empty .insight-empty-desc',  'insight_empty_desc');

  // Insight panel — metric labels (first = confidence, second = timeline)
  selN('.insight-metric-label', 0, 'insight_metric_confidence');
  selN('.insight-metric-label', 1, 'insight_metric_timeline');

  // Insight panel — section labels
  selN('.insight-section-label', 0, 'insight_section_why');
  selN('.insight-section-label', 1, 'insight_section_actions');
  selN('.insight-section-label', 2, 'insight_section_top');

  // Insight panel — toggle buttons
  sel('#insight-btn-briefing', 'insight_toggle_briefing');
  sel('#insight-btn-response', 'insight_toggle_disruptor');

  // Page Brief modal
  sel('#analyst-modal .modal-title', 'modal_page_brief_title');
  sel('#analyst-modal .brief-status', 'brief_loading_status');
  sel('#analyst-modal .brief-sub',    'brief_loading_sub');
  sel('#btn-copy-analysis',  'btn_copy_analysis');
  sel('#btn-send-to-model',  'btn_send_to_model');

  // Countermove modal
  sel('#rage-modal .modal-title',   'modal_countermove_title');
  sel('#rage-modal .cm-desc',       'countermove_desc');
  sel('#rage-modal .cm-label-you',  'countermove_label_you');
  sel('#rage-modal .cm-label-them', 'countermove_label_them');
  sel('#btn-activate-rage', 'btn_activate_countermove');

  // Disruptor modal
  sel('#disruptor-modal .modal-title',      'modal_disruptor_title');
  sel('#disruptor-loading .brief-status',   'disruptor_loading_status');
  sel('#disruptor-loading .brief-sub',      'disruptor_loading_sub');
  sel('#btn-copy-disruptor', 'btn_copy_analysis');

  // History / briefing modals
  sel('#history-modal .modal-title',  'modal_history_title');
  sel('#briefing-modal .modal-title', 'modal_briefing_title');

  // ── TRACKER ────────────────────────────────────────────────────────────────

  // Bento count label — has <br> inside, use innerHTML to preserve line break
  const bentoLbl = q('.t-bento-count-label');
  if (bentoLbl && t.sidebar_count_label) {
    bentoLbl.innerHTML = t.sidebar_count_label.replace('\n', '<br>');
  }

  sel('#t-btn-add-hot', 'btn_add');
  sel('#t-topic-controls-btn', 'btn_topic_controls');
  ph('#t-hotlist-input', 'add_topic_placeholder');

  // Drawer section titles (indexed by DOM order)
  selN('.t-right-section-title', 0, 'section_add_topic');
  selN('.t-right-section-title', 1, 'section_smarter');
  selN('.t-right-section-title', 2, 'section_daily');
  selN('.t-right-section-title', 3, 'section_radar_brief');

  // Field labels (indexed by DOM order)
  selN('.t-right-field-label', 0, 'lbl_industry');
  selN('.t-right-field-label', 1, 'lbl_brand');
  selN('.t-right-field-label', 2, 'lbl_role');
  selN('.t-right-field-label', 3, 'lbl_priority');
  selN('.t-right-field-label', 4, 'lbl_headline_lang');
  selN('.t-right-field-label', 5, 'lbl_email');
  selN('.t-right-field-label', 6, 'lbl_topics_include');
  selN('.t-right-field-label', 7, 'lbl_frequency');
  selN('.t-right-field-label', 8, 'lbl_format');

  ph('#t-user-career',   'ph_industry');
  ph('#t-user-account',  'ph_brand');
  ph('#t-user-role',     'ph_role');
  ph('#t-user-keywords', 'ph_priority');
  ph('#t-user-email',    'ph_email');
  ph('#t-hotlist-input', 'add_topic_placeholder');

  // Frequency / format select options
  opt('#t-dispatch-freq', '1',         'freq_one');
  opt('#t-dispatch-freq', '3',         'freq_three');
  opt('#t-dispatch-freq', '5',         'freq_five');
  opt('#t-dispatch-tone', 'brief',     'fmt_brief');
  opt('#t-dispatch-tone', 'detailed',  'fmt_detailed');
  opt('#t-dispatch-tone', 'narrative', 'fmt_narrative');
  opt('#t-dispatch-tone', 'rawintel',  'fmt_rawintel');

  sel('#t-recos-status',         'recos_analyzing');
  sel('#t-btn-run-recos',        'btn_generate');
  sel('#t-btn-dispatch-preview', 'btn_preview_brief');
  sel('#t-dispatch-include-home-news-label', 'dispatch_include_home_news');
  sel('.t-right-monitor-label',  'monitor_lbl');

  // Schedule panel
  selN('.t-sched-label', 0, 'sched_days');
  selN('.t-sched-label', 1, 'sched_time');
  sel('#t-sched-save', 'btn_confirm_sched');

  // Day picker buttons
  const dayKeys = ['day_sun','day_mon','day_tue','day_wed','day_thu','day_fri','day_sat'];
  qa('.t-sched-day-btn').forEach(btn => {
    const key = dayKeys[Number(btn.dataset.day)];
    if (key && t[key]) {
      if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent.trim();
      btn.textContent = t[key];
      btn.dataset.translated = lang;
    }
  });

  // Tracker modal footer
  sel('#t-modal-copy',     'modal_copy');
  sel('#t-modal-export',   'modal_export');
  sel('#t-modal-llm',      'modal_send');
  sel('#t-modal-schedule', 'modal_schedule');

  // Export menu items — have icon <span> children, update text node only
  setNode('#t-export-md-copy', 'export_copy_md');
  setNode('#t-export-md-dl',   'export_dl_md');
  setNode('#t-export-pdf',     'export_pdf');

  // Drawer header title — span inside .t-right-hd has no dedicated class
  sel('.t-right-hd > span', 'drawer_title');

  // Sidebar column heading
  sel('.t-bento-col-hd > span', 'sidebar_col_heading');

  // Monitor status toggle label ("Off")
  sel('#t-monitor-status', 'monitor_off');

  // Dashboard section tags
  sel('.feed-section-hd .section-tag', 'section_tag_monitor');
  sel('.sidebar-section-hd .section-tag', 'section_tag_analyze');

  // Dashboard sidebar section title ("Selected Insight")
  sel('.sidebar-section-hd .feed-section-title', 'sidebar_section_title');
}

// ─────────────────────────────────────────────────────────────────────────────
// Translation loading overlay
// Matches the app's existing hud-bar / brief-loading aesthetic.
// ─────────────────────────────────────────────────────────────────────────────
export function showTranslationOverlay(langName) {
  const overlay = document.getElementById('tr-overlay');
  if (!overlay) return;
  const status = overlay.querySelector('.tr-status');
  if (status) status.textContent = `Translating to ${langName}…`;
  overlay.style.visibility = 'visible';
  overlay.style.opacity    = '0';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });
  });
}

export function hideTranslationOverlay() {
  const overlay = document.getElementById('tr-overlay');
  if (!overlay) return;
  overlay.style.opacity = '0';
  setTimeout(() => { overlay.style.visibility = 'hidden'; }, 300);
}
