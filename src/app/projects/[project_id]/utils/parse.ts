export const simpleHash = (str: string) =>
  str
    .split("")
    .reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) & 0xffffffff, 0)
    .toString(16);
