{
  description = "Niko development environment and web runner";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      supportedSystems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
      pkgsFor = system: import nixpkgs { inherit system; };
    in
    {
      packages = forAllSystems (system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.writeShellApplication {
            name = "niko";
            runtimeInputs = [ pkgs.nodejs_22 pkgs.pnpm_10 ];
            text = ''
              if [[ ! -d node_modules ]]; then
                pnpm install --frozen-lockfile
              fi
              exec pnpm dev "$@"
            '';
          };
        });

      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/niko";
          meta.description = "Run Niko's web interface";
        };
      });

      devShells = forAllSystems (system:
        let
          pkgs = pkgsFor system;
          linuxLibraries = with pkgs; [
            at-spi2-atk
            atkmm
            cairo
            gdk-pixbuf
            glib
            gtk3
            libsoup_3
            pango
            webkitgtk_4_1
          ];
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              cargo
              nodejs_22
              pkg-config
              pnpm_10
              rustc
              rustfmt
            ] ++ pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux linuxLibraries;

            # Tauri discovers its native libraries through pkg-config on Linux.
            LD_LIBRARY_PATH = pkgs.lib.optionalString pkgs.stdenv.hostPlatform.isLinux
              (pkgs.lib.makeLibraryPath linuxLibraries);
          };
        });
    };
}
