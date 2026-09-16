import { databaseQuery } from "@/lib/db";
import { nutrientDefinitions } from "@/lib/nutrition-targets";

export async function ensureNutrientDefinitions() {
  const params: unknown[] = [];
  const values = nutrientDefinitions.map((definition, index) => {
    const offset = index * 8;
    params.push(definition.code, definition.displayName, definition.groupName, definition.canonicalUnit,
      definition.hierarchyLevel, definition.sortOrder, definition.targetKind, definition.defaultTarget);
    return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8})`;
  });
  await databaseQuery(
    `INSERT INTO food_catalog.app.nutrient_definitions
       (code,display_name,group_name,canonical_unit,hierarchy_level,sort_order,target_kind,default_target)
     VALUES ${values.join(",")}
     ON CONFLICT (code) DO UPDATE SET display_name=excluded.display_name, group_name=excluded.group_name,
       canonical_unit=excluded.canonical_unit, hierarchy_level=excluded.hierarchy_level,
       sort_order=excluded.sort_order, target_kind=excluded.target_kind, default_target=excluded.default_target`,
    params,
  );
}
