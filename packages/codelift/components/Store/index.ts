import { groupBy } from "lodash";
import { observer } from "mobx-react-lite";
import { Instance, types } from "mobx-state-tree";
import { createContext, useContext, SyntheticEvent } from "react";

import { TailwindRule } from "./TailwindRule";
import { Target } from "./Target";

export { observer, TailwindRule };

export const Store = types
  .model("Store", {
    cssRules: types.array(TailwindRule),
    query: "",
    isOpen: true,
    target: types.optional(Target, () => Target.create())
  })
  .volatile(self => ({
    // Needed for scrollX/Y
    contentWindow: null as null | Window,
    // Needed for document.body
    document: null as null | HTMLDocument,
    // In-case of an error accessing the iframe
    error: null as null | Error,
    // Needed for <Selector />
    root: null as null | HTMLElement,
    rule: null as null | Instance<typeof TailwindRule>
  }))
  .views(self => ({
    get appliedCSSRules() {
      const { target } = self;

      if (!target) {
        return [];
      }

      return this.queriedCSSRules.filter(target.hasRule);
    },

    get queriedCSSRules() {
      const { cssRules, query } = self;

      if (!query) {
        return cssRules;
      }

      const words = query
        .split(" ")
        .map(word => word.trim())
        .filter(Boolean);

      return words.reduce(
        (filtered, word) => {
          const tests = [
            (rule: Instance<typeof TailwindRule>) => {
              return rule.className.startsWith(word);
            },

            (rule: Instance<typeof TailwindRule>) => {
              return rule.cssText.includes(word);
            }
          ];

          return filtered.filter(rule => tests.some(test => test(rule)));
        },
        [...cssRules]
      );
    },

    get groupedCSSRules() {
      return Object.entries(
        groupBy(
          this.queriedCSSRules
            // Remove duplicates
            // .filter(match => !this.appliedRules.includes(match))
            // Remove :hover, :active, etc.
            .filter(match => match.className.indexOf(":") === -1),
          ({ group = "Other " }) => group
        )
      );
    },

    get root() {
      if (!self.document) {
        return null;
      }

      return (
        // CRA
        self.document.querySelector("#root") ||
        // Next.js
        self.document.querySelector("#__next") ||
        // Whatever
        self.document.querySelector("body")
      );
    }
  }))
  .actions(self => ({
    close() {
      self.isOpen = false;
    },

    handleFrameLoad(event: SyntheticEvent) {
      if (!(event.target instanceof HTMLIFrameElement)) {
        throw new Error(`handleLoad expected an iFrame`);
      }

      const iframe = event.target;

      if (!iframe.contentWindow) {
        throw new Error("iframe missing contentWindow");
      }

      document.domain = "localhost";

      self.contentWindow = iframe.contentWindow;

      try {
        self.document = iframe.contentWindow.document;
        self.error = null;
      } catch (error) {
        self.error = error;
        console.error(error);

        return;
      }

      const { selector } = self.target;

      const element = selector
        ? (self.document.querySelector(selector) as HTMLElement)
        : null;

      if (element) {
        self.target.set(element);
      } else {
        self.target.unset();
      }

      window.removeEventListener("keydown", this.handleKeyPress);
      window.addEventListener("keydown", this.handleKeyPress);

      self.contentWindow.removeEventListener("keydown", this.handleKeyPress);
      self.contentWindow.addEventListener("keydown", this.handleKeyPress);

      self.contentWindow.addEventListener("unload", this.handleFrameUnload);

      this.initCSSRules();
    },

    handleFrameUnload() {
      self.contentWindow = null;
      self.document = null;
    },

    handleKeyPress(event: KeyboardEvent) {
      const { key, metaKey } = event;

      // CMD+'
      if (metaKey && key === "'") {
        event.preventDefault();

        if (self.isOpen) {
          return this.close();
        } else {
          return this.open();
        }
      }

      // Ignore any other commands until we're open
      if (!self.isOpen) {
        return;
      }

      if (key === "Escape") {
        event.preventDefault();

        if (self.target.isLocked) {
          return self.target.unlock();
        }

        if (self.isOpen) {
          self.target.unset();

          return this.close();
        }
      }
    },

    handleTargetHover(element: HTMLElement) {
      if (!self.target.isLocked) {
        self.target.set(element);
      }
    },

    handleTargetSelect(target: HTMLElement) {
      self.target.lock();
    },

    initCSSRules() {
      if (!self.document) {
        return;
      }

      if (self.cssRules.length) {
        return;
      }

      const styleSheets = [...self.document.styleSheets].filter(
        styleSheet => styleSheet.constructor.name === "CSSStyleSheet"
      );

      const cssStyleRules = styleSheets
        .reduce((acc, styleSheet) => {
          const cssRules = [...(styleSheet as CSSStyleSheet).cssRules].filter(
            cssRule => cssRule.constructor.name === "CSSStyleRule"
          );

          return acc.concat(cssRules as CSSStyleRule[]);
        }, [] as CSSStyleRule[])
        // ? Sorting doesn't seem very useful (yet)
        // .sort((a, b) => {
        //   const [aString, aNumber] = a.selectorText.split(/(\d+$)/);
        //   const [bString, bNumber] = b.selectorText.split(/(\d+$)/);

        //   return (
        //     aString.localeCompare(bString) || Number(aNumber) - Number(bNumber)
        //   );
        // })
        .filter(cssStyleRule => {
          // Only show utility class
          return cssStyleRule.selectorText.lastIndexOf(".") === 0;
        });

      const tailwindRules = cssStyleRules.map(cssStyleRule => {
        const { cssText, selectorText, style } = cssStyleRule;

        return TailwindRule.create({
          cssText,
          selectorText,
          style: Object.values(style).reduce(
            (acc, property) => ({
              ...acc,
              [property]: style[property as any]
            }),
            {}
          )
        });
      });

      self.cssRules.replace(tailwindRules);
    },

    open() {
      self.isOpen = true;
    },

    resetQuery() {
      self.query = "";
    },

    search(value: string) {
      self.query = value;
    },

    // TODO Move these calls to store.target
    unlockTarget() {
      self.target.unlock();
    }
  }));

export const StoreContext = createContext(Store.create());
export const useStore = () => useContext(StoreContext);
