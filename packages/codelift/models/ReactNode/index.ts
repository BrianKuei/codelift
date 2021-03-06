import { Instance, types, IAnyModelType } from "mobx-state-tree";
import { createNode, ElementNode } from "../ElementNode";

export interface IReactNode extends Instance<typeof ReactNode> {}

export const ReactNode = types
  .model("ReactNode", {
    children: types.array(types.late((): IAnyModelType => ReactNode)),
    element: types.maybe(ElementNode),
    uuid: types.optional(types.identifierNumber, () => Math.random())
  })
  .volatile(self => ({
    instance: null as any
  }))
  .views(self => ({
    get fileName() {
      return self.instance._debugSource.fileName;
    },

    get isComponent() {
      return typeof self.instance.elementType !== "string";
    },

    get isElement() {
      return typeof self.instance.elementType === "string";
    },

    get isUserCode() {
      return Boolean(self.instance._debugSource);
    },

    get lineNumber() {
      return self.instance._debugSource.lineNumber;
    },

    get name(): string {
      const { elementType } = self.instance;

      if (this.isComponent) {
        if (elementType.name) {
          return String(elementType.name);
        }

        return "Anonymous";
      }

      return String(elementType);
    }
  }))
  .actions(self => ({
    openInIDE() {
      const query = `
        mutation OpenInIDE($fileName: String!, $lineNumber: Int!) {
          openInIDE(fileName: $fileName, lineNumber: $lineNumber)
        }
      `;

      const { fileName, lineNumber } = self;
      const variables = { fileName, lineNumber };

      fetch("/api", {
        method: "POST",
        body: JSON.stringify({ query, variables })
      });
    },

    setInstance(instance: any) {
      self.children.clear();
      self.instance = instance;

      if (self.isElement) {
        self.element = createNode(self.instance.stateNode);
      }

      let child = self.instance.child;

      // child/sibling are a linked list, so children = child + siblings
      while (child) {
        self.children.push(createReactNode(child));
        child = child.sibling;
      }
    }
  }));

export const createReactNode = (instance: any) => {
  const node = ReactNode.create();
  node.setInstance(instance);

  return node;
};

export const flattenReactNodes = (nodes: IReactNode[]) => {
  return nodes.reduce((acc, node) => {
    acc.push(node);
    acc.push(...flattenReactNodes(node.children));

    return acc;
  }, [] as IReactNode[]);
};

export const getReactInstance = (element: HTMLElement) => {
  if ("_reactRootContainer" in element) {
    // @ts-ignore Property '_reactRootContainer' does not exist on type 'never'.ts(2339)
    return element._reactRootContainer._internalRoot.current.child;
  }

  for (const key in element) {
    if (key.startsWith("__reactInternalInstance$")) {
      // @ts-ignore No index signature with a parameter of type 'string' was found on type 'HTMLElement'.ts(7053)
      return element[key];
    }
  }
};
