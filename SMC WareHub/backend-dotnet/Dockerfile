FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY WareHub.Api.csproj ./
RUN dotnet restore
COPY . ./
RUN dotnet publish -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/publish .
RUN mkdir -p /data && chown $APP_UID:$APP_UID /data
ENV ASPNETCORE_URLS=http://+:4000
EXPOSE 4000
USER $APP_UID
ENTRYPOINT ["dotnet", "WareHub.Api.dll"]
