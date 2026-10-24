import {createClient} from "npm:@supabase/supabase-js@2.79.0";
import {createImageReviewHandler} from "./handler.ts";
Deno.serve(createImageReviewHandler({createClient,env:(name:string)=>Deno.env.get(name)?.trim()||"",fetcher:fetch}));
