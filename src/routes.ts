import { Application } from "express";
import categoriesRouter from "./api/controllers/categories/router";
import followRouter from "./api/controllers/follows/router";
import nftsRouter from "./api/controllers/nfts/router";
import usersRouter from "./api/controllers/users/router";

export default function routes(app: Application): void {
  app.use("/api/users", usersRouter);
  app.use("/api/NFTs", nftsRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/follow", followRouter);
  app.use("/ping", (req, res) => {
    res.json("Working as it should");
  });
  console.log("STARTED");
}
