# Herdr mods

- Herdr reads these files through links in `~/.config/herdr-app`, made by `../install.sh`. It watches its own folder,
  not this repo, so it doesn't see an edit here: run `../install.sh` after changing a mod, a layout or `keys.json`.
  Re-linking makes Herdr reload.
- Check a mod with `herdr-app check herdr-app/mods/<name>`, then `herdr-app status` (its `errors` list).
- Change only the mods here. Herdr replaces its shipped mods on update: to change one, `mod.clone` it, then move the
  clone here and run `../install.sh`.
- Herdr's own guide for writing mods: `~/.config/herdr-app/AGENTS.md`.
- Keep `../README.md` (key table, what each mod does) in step.
