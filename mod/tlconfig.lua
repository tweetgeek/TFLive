local home = os.getenv("HOME") or ""
local tf3 = os.getenv("TF3_DIR") or (home .. "/Library/Application Support/Steam/steamapps/common/Transport Fever 3")
return {
	include_dir = { tf3 .. "/api/tealdef", tf3 .. "/base/tealdef", "." },
	global_env_def = "all_def",
}
