$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot '..\mod\CityMap\CityMap.csproj'

dotnet format $project --verify-no-changes
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

dotnet build $project --no-incremental -p:CityMapCompileOnly=true -p:TreatWarningsAsErrors=true -v:q
exit $LASTEXITCODE
