/**
 * 字段级「人工锁定防覆盖」合并器：
 * 任何写入 catalog_universities / catalog_colleges / catalog_advisors 的自动抓取更新，
 * 都会跳过 manualLockedFields 中记录的字段名，保证运维手工纠偏不被二次冲刷。
 */
export function mergeWithLockedFields<T extends Record<string, any>>(
  existingRow: T,
  incomingPatch: Partial<T>,
  manualLockedFields: readonly string[] = []
): Partial<T> {
  if (!manualLockedFields || manualLockedFields.length === 0) {
    return { ...incomingPatch };
  }
  const locked = new Set(manualLockedFields);
  const safePatch: Partial<T> = {};
  for (const key of Object.keys(incomingPatch) as Array<keyof T>) {
    if (locked.has(String(key))) {
      continue;
    }
    if (key in existingRow || incomingPatch[key] !== undefined) {
      safePatch[key] = incomingPatch[key];
    }
  }
  return safePatch;
}
