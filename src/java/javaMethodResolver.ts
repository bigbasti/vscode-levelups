import { BeanInfo, MethodInfo } from "./javaClassResolver";

export function findMethodLocation(
  bean: BeanInfo,
  methodName: string
): MethodInfo | undefined {
  return bean.methods.find((m) => m.name === methodName);
}
