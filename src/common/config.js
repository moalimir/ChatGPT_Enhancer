/**
 * Default configuration settings and global constants for the extension.
 */

export const DEFAULT_SETTINGS = {
  enableFix: true,
  fixKatex: true,
  fixCode: true,
  copyKatex: true,
  exportFormat: 'pdf',
  exportScope: 'all',
  exportQuickAction: false,
  exportQuickActionPosition: null,
  theme: 'original',
  fontsEnabled: false,
  fontEnglish: 'inter',
  fontPersian: 'vazirmatn'
};

export const THEME_COMPATIBILITY = {
  midnight: 'dark',
  aurora: 'dark',
  nebula: 'dark',
  paper: 'light',
  skylight: 'light'
};

export const FONT_STACKS = {
  english: {
    inter: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
    'source-sans-3': '"Source Sans 3", "Segoe UI", system-ui, -apple-system, sans-serif',
    roboto: '"Roboto", "Segoe UI", system-ui, -apple-system, sans-serif',
    'noto-sans': '"Noto Sans", "Segoe UI", system-ui, -apple-system, sans-serif',
    'work-sans': '"Work Sans", "Segoe UI", system-ui, -apple-system, sans-serif'
  },
  persian: {
    vazirmatn: '"Vazirmatn", "Noto Sans Arabic", "Tahoma", "Arial", sans-serif',
    'noto-naskh-arabic': '"Noto Naskh Arabic", "Vazirmatn", "Tahoma", "Arial", sans-serif',
    'noto-sans-arabic': '"Noto Sans Arabic", "Vazirmatn", "Tahoma", "Arial", sans-serif',
    sahel: '"Sahel", "Vazirmatn", "Tahoma", "Arial", sans-serif',
    shabnam: '"Shabnam", "Vazirmatn", "Tahoma", "Arial", sans-serif'
  }
};
