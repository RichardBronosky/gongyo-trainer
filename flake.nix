{
  description = "Gongyo Trainer local development tools";

  # Resolve through the host's pinned nixpkgs registry, matching sibling projects.
  inputs.nixpkgs.url = "nixpkgs";

  outputs = { nixpkgs, ... }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        config.allowUnfreePredicate = pkg: (pkg.pname or "") == "ngrok";
      };
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          ngrok
          ntfy-sh
          python3
        ];
      };
    };
}
