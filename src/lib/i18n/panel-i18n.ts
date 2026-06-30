export type PanelLocale = "en" | "es" | "fr" | "ar";



export const PANEL_LOCALES: { code: PanelLocale; label: string }[] = [

  { code: "en", label: "English" },

  { code: "es", label: "Español" },

  { code: "fr", label: "Français" },

  { code: "ar", label: "العربية" },

];



const messages: Record<PanelLocale, Record<string, string>> = {

  en: {

    dashboard: "Dashboard",

    settings: "Settings",

    logout: "Log out",

    save: "Save",

    loading: "Loading…",

    notifications: "Notifications",

    liveConnections: "Live Connections",

    login: "Sign in",

    username: "Username",

    password: "Password",

    rememberMe: "Remember me",

    signIn: "Sign in",

    portalTitle: "Subscriber portal",

    portalSubtitle: "View your subscription, playlists, and player setup.",

    mySubscription: "My subscription",

    playerSetup: "Player setup",

    playlistUrls: "Playlist URLs",

    support: "Support",

    copy: "Copy",

    renew: "Renew subscription",

    topUp: "Top up credits",

    createTicket: "Open support ticket",

    downloadM3u: "Download M3U",

    epgGuide: "EPG guide",

    status: "Status",

    expires: "Expires",

    maxDevices: "Max devices",

    bouquets: "Bouquets",

    keySettings: "Key settings",

    language: "Language",

  },

  es: {

    dashboard: "Panel",

    settings: "Ajustes",

    logout: "Cerrar sesión",

    save: "Guardar",

    loading: "Cargando…",

    notifications: "Notificaciones",

    liveConnections: "Conexiones en vivo",

    login: "Iniciar sesión",

    username: "Usuario",

    password: "Contraseña",

    rememberMe: "Recordarme",

    signIn: "Entrar",

    portalTitle: "Portal del abonado",

    portalSubtitle: "Consulta tu suscripción, listas y configuración del reproductor.",

    mySubscription: "Mi suscripción",

    playerSetup: "Configurar reproductor",

    playlistUrls: "URLs de lista",

    support: "Soporte",

    copy: "Copiar",

    renew: "Renovar suscripción",

    topUp: "Recargar créditos",

    createTicket: "Abrir ticket",

    downloadM3u: "Descargar M3U",

    epgGuide: "Guía EPG",

    status: "Estado",

    expires: "Expira",

    maxDevices: "Dispositivos máx.",

    bouquets: "Bouquets",

    keySettings: "Ajustes clave",

    language: "Idioma",

  },

  fr: {

    dashboard: "Tableau de bord",

    settings: "Paramètres",

    logout: "Déconnexion",

    save: "Enregistrer",

    loading: "Chargement…",

    notifications: "Notifications",

    liveConnections: "Connexions live",

    login: "Connexion",

    username: "Nom d'utilisateur",

    password: "Mot de passe",

    rememberMe: "Se souvenir de moi",

    signIn: "Se connecter",

    portalTitle: "Portail abonné",

    portalSubtitle: "Consultez votre abonnement, playlists et configuration lecteur.",

    mySubscription: "Mon abonnement",

    playerSetup: "Configuration lecteur",

    playlistUrls: "URLs de playlist",

    support: "Support",

    copy: "Copier",

    renew: "Renouveler l'abonnement",

    topUp: "Recharger les crédits",

    createTicket: "Ouvrir un ticket",

    downloadM3u: "Télécharger M3U",

    epgGuide: "Guide EPG",

    status: "Statut",

    expires: "Expire le",

    maxDevices: "Appareils max",

    bouquets: "Bouquets",

    keySettings: "Paramètres clés",

    language: "Langue",

  },

  ar: {

    dashboard: "لوحة التحكم",

    settings: "الإعدادات",

    logout: "تسجيل الخروج",

    save: "حفظ",

    loading: "جاري التحميل…",

    notifications: "الإشعارات",

    liveConnections: "الاتصالات المباشرة",

    login: "تسجيل الدخول",

    username: "اسم المستخدم",

    password: "كلمة المرور",

    rememberMe: "تذكرني",

    signIn: "دخول",

    portalTitle: "بوابة المشترك",

    portalSubtitle: "اعرض اشتراكك وقوائم التشغيل وإعداد المشغّل.",

    mySubscription: "اشتراكي",

    playerSetup: "إعداد المشغّل",

    playlistUrls: "روابط القوائم",

    support: "الدعم",

    copy: "نسخ",

    renew: "تجديد الاشتراك",

    topUp: "شحن الرصيد",

    createTicket: "فتح تذكرة دعم",

    downloadM3u: "تنزيل M3U",

    epgGuide: "دليل EPG",

    status: "الحالة",

    expires: "ينتهي",

    maxDevices: "الأجهزة القصوى",

    bouquets: "الباقات",

    keySettings: "الإعدادات الرئيسية",

    language: "اللغة",

  },

};



export function t(locale: PanelLocale, key: string): string {

  return messages[locale]?.[key] ?? messages.en[key] ?? key;

}



export function normalizeLocale(raw: string | null | undefined): PanelLocale {

  const code = String(raw ?? "en").slice(0, 2).toLowerCase();

  if (code === "es" || code === "fr" || code === "ar") return code;

  return "en";

}



export const LOCALE_STORAGE_KEY = "nexlify_panel_locale";

