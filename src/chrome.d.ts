// Nur die drei APIs, die diese Extension nutzt. Bewusst keine Abhaengigkeit
// auf @types/chrome: die Extension soll ohne node_modules baubar bleiben.
declare namespace chrome {
  namespace i18n {
    function getUILanguage(): string
  }
  namespace tabs {
    type Tab = { id?: number; url?: string }
    function query(info: { active?: boolean; currentWindow?: boolean }): Promise<Tab[]>
  }
  namespace scripting {
    function executeScript<T>(injection: {
      target: { tabId: number }
      func: () => Promise<T> | T
    }): Promise<Array<{ result?: T }>>
  }
}
