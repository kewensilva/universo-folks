import { z } from 'zod';

/**
 * `.partial()` para PATCH sem os `.default()` do schema de criação.
 * No Zod 4 o `.partial()` mantém os defaults: um PATCH só com `name` voltaria
 * `status`/`isActive`/`isDefault` ao padrão sem o cliente pedir.
 */
export function patchOf<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([k, v]) => [k, (v instanceof z.ZodDefault ? v.unwrap() : v) as z.ZodType]),
  );
  return z.object(shape).partial() as unknown as ReturnType<z.ZodObject<T>['partial']>;
}
