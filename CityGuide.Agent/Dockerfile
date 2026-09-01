# CityGuide ingestion agent — built from the repo root:
#   docker build -f CityGuide.Agent/Dockerfile -t cityguide-agent .
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY CityGuide.Agent/ CityGuide.Agent/
RUN dotnet publish CityGuide.Agent/CityGuide.Agent.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/runtime:10.0
WORKDIR /app
COPY --from=build /app .
ENTRYPOINT ["dotnet", "CityGuide.Agent.dll"]
