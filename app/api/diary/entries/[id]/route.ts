import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";
import { macroValues, scaleNutrients, selectedPortionGrams, selectedPortionMultiplier, type JsonObject, type PortionOption } from "@/lib/food-portions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const mealTypes = ["breakfast","lunch","dinner","snack"] as const;
type MealType = (typeof mealTypes)[number];
type StoredEntry = {
  id:string; diary_date:string; meal_type:MealType; quantity:string; grams:string|null; serving:JsonObject|null; portion_id:string|null;
  nutrients:JsonObject; nutrition_per_100_snapshot:JsonObject|null; portion_options_snapshot:PortionOption[]|null;
  energy_kcal:string|null; protein_g:string|null; carbohydrate_g:string|null; total_fat_g:string|null;
  dietary_fiber_g:string|null; total_sugars_g:string|null; sodium_mg:string|null;
};
type UpdateEntryInput = { mealType?:unknown; portionId?:unknown; amount?:unknown; quantity?:unknown };

function isMealType(value: unknown): value is MealType {
  return typeof value === "string" && mealTypes.includes(value as MealType);
}
function validId(id:string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id); }
function numeric(value:string|null) { return value === null ? null : Number(value); }

async function currentEntry(profileId:string,id:string) {
  const result = await databaseQuery<StoredEntry>(
    `SELECT id,diary_date::text,meal_type,quantity::text,grams::text,serving,portion_id,nutrients,nutrition_per_100_snapshot,portion_options_snapshot,
            energy_kcal::text,protein_g::text,carbohydrate_g::text,total_fat_g::text,dietary_fiber_g::text,total_sugars_g::text,sodium_mg::text
     FROM food_catalog.app.diary_entries WHERE id=$1 AND profile_id=$2 LIMIT 1`, [id,profileId]);
  return result.rows[0] ?? null;
}

/** Update a diary meal, amount, or serving unit from its immutable nutrition snapshot. */
export async function PATCH(request:NextRequest,context:{params:Promise<{id:string}>}) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ message:"Invalid diary entry id." }, { status:400 });
  let input:UpdateEntryInput;
  try { input=await request.json() as UpdateEntryInput; }
  catch { return NextResponse.json({ message:"Request body must be valid JSON." }, { status:400 }); }
  const changingMeal=input.mealType!==undefined;
  const changingAmount=input.amount!==undefined || input.quantity!==undefined;
  const changingPortion=input.portionId!==undefined;
  const rawAmount=input.amount ?? input.quantity;
  const amount=typeof rawAmount === "number" ? rawAmount : Number(rawAmount);
  if (!changingMeal && !changingAmount && !changingPortion) return NextResponse.json({ message:"Provide mealType, amount, or portionId." }, { status:400 });
  if ((changingMeal && !isMealType(input.mealType)) || (changingAmount && (!Number.isFinite(amount) || amount<0.01 || amount>100000)) || (changingPortion && typeof input.portionId!=="string")) {
    return NextResponse.json({ message:"Invalid diary entry update." }, { status:400 });
  }

  try {
    const user=await getOrCreateCurrentUser(request);
    const entry=await currentEntry(user.profileId,id);
    if (!entry) return attachCurrentUserCookie(NextResponse.json({ message:"Diary entry not found." }, { status:404 }),user);
    await databaseQuery("DELETE FROM food_catalog.app.diary_day_completions WHERE profile_id=$1 AND diary_date=$2", [user.profileId, entry.diary_date]);
    const nextMeal=changingMeal ? input.mealType as MealType : entry.meal_type;
    const nextAmount=changingAmount ? amount : Number(entry.quantity);
    const options=entry.portion_options_snapshot ?? [];
    const requestedPortion=changingPortion ? input.portionId as string : entry.portion_id;
    const portion=options.find((option)=>option.id===requestedPortion) ?? options[0] ?? null;

    let nutrients:JsonObject;
    let grams:number|null;
    let serving:JsonObject|null=entry.serving;
    let portionId=entry.portion_id;
    let unit=typeof entry.serving?.unit === "string" ? entry.serving.unit : "serving";
    let portionLabel=typeof entry.serving?.label === "string" ? entry.serving.label : null;
    let gramsPerUnit:number|null=null;
    if ((changingAmount || changingPortion) && entry.nutrition_per_100_snapshot && portion) {
      const multiplier=selectedPortionMultiplier(portion,nextAmount);
      nutrients=scaleNutrients(entry.nutrition_per_100_snapshot,multiplier);
      grams=selectedPortionGrams(portion,nextAmount);
      serving={...portion,selectedAmount:nextAmount}; portionId=portion.id; unit=portion.unit; portionLabel=portion.label;
      gramsPerUnit=portion.grams===null ? null : portion.grams/portion.amount;
    } else if (changingAmount) {
      const multiplier=nextAmount/Number(entry.quantity);
      nutrients=scaleNutrients(entry.nutrients,multiplier);
      grams=entry.grams===null ? null : Number(entry.grams)*multiplier;
    } else {
      nutrients=entry.nutrients; grams=numeric(entry.grams);
    }
    if (changingPortion && !portion) return attachCurrentUserCookie(NextResponse.json({ message:"That serving unit is no longer available for this entry." }, { status:400 }),user);
    const macros=macroValues(nutrients);
    const result=await databaseQuery<{id:string;meal_type:MealType;quantity:string;grams:string|null}>(
      `UPDATE food_catalog.app.diary_entries SET meal_type=$1,quantity=$2,grams=$3,serving=$4::JSONB,portion_id=$5,unit=$6,
         portion_label_snapshot=$7,gram_weight_per_portion=$8,nutrients=$9::JSONB,energy_kcal=$10,protein_g=$11,
         carbohydrate_g=$12,total_fat_g=$13,dietary_fiber_g=$14,total_sugars_g=$15,sodium_mg=$16,updated_at=now()
       WHERE id=$17 AND profile_id=$18 RETURNING id,meal_type,quantity::text,grams::text`,
      [nextMeal,nextAmount,grams,JSON.stringify(serving),portionId,unit,portionLabel,gramsPerUnit,JSON.stringify(nutrients),
       macros.energyKcal,macros.proteinG,macros.carbohydrateG,macros.totalFatG,macros.dietaryFiberG,macros.totalSugarsG,macros.sodiumMg,id,user.profileId]);
    const updated=result.rows[0];
    return attachCurrentUserCookie(NextResponse.json({ id:updated.id,mealType:updated.meal_type,amount:Number(updated.quantity),quantity:Number(updated.quantity),grams:numeric(updated.grams),portionId,portion }),user);
  } catch(error) {
    console.error("Update diary entry failed",error);
    const message=error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Diary storage is temporarily unavailable. Run npm run db:enable-flexible-portions if you have not migrated yet.";
    return NextResponse.json({ message }, { status:503 });
  }
}

export async function DELETE(request:NextRequest,context:{params:Promise<{id:string}>}) {
  const { id }=await context.params;
  if (!validId(id)) return NextResponse.json({ message:"Invalid diary entry id." }, { status:400 });
  try {
    const user=await getOrCreateCurrentUser(request);
    const result=await databaseQuery<{id:string;diary_date:string}>("DELETE FROM food_catalog.app.diary_entries WHERE id=$1 AND profile_id=$2 RETURNING id,diary_date::text",[id,user.profileId]);
    if (!result.rows[0]) return attachCurrentUserCookie(NextResponse.json({ message:"Diary entry not found." }, { status:404 }),user);
    await databaseQuery("DELETE FROM food_catalog.app.diary_day_completions WHERE profile_id=$1 AND diary_date=$2", [user.profileId, result.rows[0].diary_date]);
    return attachCurrentUserCookie(new NextResponse(null,{status:204}),user);
  } catch(error) {
    console.error("Delete diary entry failed",error);
    const message=error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Diary storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status:503 });
  }
}
