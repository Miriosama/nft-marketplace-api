import { CustomResponse, ICompleteNFT, INFT } from "../../interfaces/graphQL";
import UserService from "../services/user";
import L from "../../common/logger";
import NFTService from "../services/nft";
import { ICategory } from "../../interfaces/ICategory";
import { fetchTimeout, removeURLSlash } from "../../utils";
import { IUser } from "src/interfaces/IUser";
import { NFTsQuery } from "../validators/nftValidators";

const ipfsGateways = {
  ternoaPinataIpfsGateaway: `https://ternoa.mypinata.cloud/ipfs`,
  cloudfareIpfsGateaway: `https://cloudflare-ipfs.com/ipfs`,
  ternoaIpfsGateway: `https://ipfs.ternoa.dev/ipfs`,
}
const defaultIpfsGateway = ipfsGateways.ternoaIpfsGateway;
const ipfsGatewayUri = (process.env.IPFS_GATEWAY && removeURLSlash(process.env.IPFS_GATEWAY)) || defaultIpfsGateway;

function extractHashFromGatewayUri(uri: string) {
  const regex: RegExp = new RegExp('(http?s:\/\/.*\/)(.*)', 'gm');
  const ipfsLinkParts = regex.exec(uri);
  if (ipfsLinkParts?.length === 3) {
    return ipfsLinkParts[2];
  } else {
    throw new Error("Invalid IPFS hash given: " + uri);
  }
}
function overwriteDefaultIpfsGateway(uri: string): string {
  const ipfsHash: string = extractHashFromGatewayUri(uri);
  return `${ipfsGatewayUri}/${ipfsHash}`
}
function parseRawNFT(NFT: INFT): INFT {
  try {
    const { uri } = NFT;
    if (uri && uri.indexOf(defaultIpfsGateway) < 0) {
      NFT.uri = overwriteDefaultIpfsGateway(uri);
    }
    return NFT;
  } catch (err) {
    L.error({ err }, "Can't parse raw nft");
    return NFT;
  }
}

/**
 * Adds information to NFT object from external sources
 * @param NFT - NFT object
 * @returns - NFT object with new fields
 */
 export async function populateNFT(NFT: INFT, seriesData: CustomResponse<INFT>, query: NFTsQuery): Promise<ICompleteNFT | INFT> {
  const retNFT: INFT = parseRawNFT(NFT);
  const [serieData, creatorData, ownerData, info, categories] = await Promise.all([
    populateSerieData(retNFT, seriesData, query),
    populateNFTCreator(retNFT),
    populateNFTOwner(retNFT),
    populateNFTUri(retNFT),
    populateNFTCategories(retNFT),
  ]);
  return { ...retNFT, ...serieData, creatorData, ownerData, ...info, categories };
}

export async function populateSerieData(
  NFT: INFT,
  seriesData: CustomResponse<INFT>,
  query: NFTsQuery
): Promise<{ 
    serieData: INFT[]; 
    totalNft: number; 
    totalListedNft: number; 
    totalListedInMarketplace: number;
    totalOwnedByRequestingUser: number;
    totalOwnedListedByRequestingUser: number;
    smallestPrice: string;
    smallestPriceTiime: string;
  }> {
  try {
    const marketplaceId = query.filter?.marketplaceId
    const owner = query.filter?.owner
    if (NFT.serieId === '0') return {
      serieData: [{ id: NFT.id, owner: NFT.owner, listed: NFT.listed, price: NFT.price, priceTiime: NFT.priceTiime, marketplaceId: NFT.marketplaceId }],
      totalNft: 1,
      totalListedNft: NFT.listed,
      totalListedInMarketplace: NFT.listed,
      totalOwnedByRequestingUser: 1,
      totalOwnedListedByRequestingUser: NFT.listed,
      smallestPrice: NFT.price,
      smallestPriceTiime: NFT.priceTiime
    }
    const result = seriesData.data.filter(x => x.serieId === NFT.serieId)
    const serieData = result.sort((a, b) => 
      b.listed - a.listed || // listed first
      (!marketplaceId ? 0 : (marketplaceId === Number(a.marketplaceId) ? -1 : (marketplaceId === Number(b.marketplaceId) ? 1 : 0))) || // marketplace id first (if defined)
      Number(a.price) - Number(b.price) || // smallest price first
      Number(a.priceTiime) - Number(b.priceTiime)) // smallest price tiime first
    const listedNft = serieData.filter(x => x.listed)
    return { 
      serieData: !query.filter?.noSeriesData ? serieData : [], 
      totalNft: serieData.length, 
      totalListedNft: listedNft.length,
      totalListedInMarketplace: marketplaceId ? listedNft.filter(x => Number(x.marketplaceId)===marketplaceId).length : listedNft.length,
      totalOwnedByRequestingUser: owner ? serieData.filter(x => x.owner === owner).length : 0,
      totalOwnedListedByRequestingUser: owner ? listedNft.filter(x => x.owner === owner).length : 0,
      smallestPrice: serieData.length > 0 ? serieData[0].price : NFT.price,
      smallestPriceTiime: serieData.length > 0 ? serieData[0].priceTiime : NFT.priceTiime
    }
  } catch (err) {
    L.error({ err }, "NFTs with same serie could not have been fetched");
    return null;
  }
}

/**
 * Pulls owner from database and adds creator's info to NFT object
 * @param NFT - NFT object with creator field
 * @returns NFT object with new creactorData field, if creator's id was valid, object stays untouched otherwise
 */
export async function populateNFTCreator(
  NFT: INFT
): Promise<IUser> {
  try {
    const { creator } = NFT;
    const creatorData = await UserService.findUser({id: creator});
    return creatorData;
  } catch (err) {
    L.error({ err }, "NFT creator id not in database");
    return null;
  }
}

/**
 * Pulls owner from database and adds owner's info to NFT object
 * @param NFT - NFT object with owner field
 * @returns NFT object with new ownerData field, if owner's id was valid, object stays untouched otherwise
 */
export async function populateNFTOwner(
  NFT: INFT
): Promise<IUser> {
  try {
    const { owner } = NFT;
    const ownerData = await UserService.findUser({id: owner});
    return ownerData;
  } catch (err) {
    L.error({ err }, "NFT owner id not in database");
    return null;
  }
}

/**
 * Populates an NFT object with data from its URI JSON
 * @param NFT - NFT object with uri field
 * @returns NFT object with new fields, if uri was valid, object stays untouched otherwise
 */
export async function populateNFTUri(NFT: INFT): Promise<any> {
  try {
    const response = await fetchTimeout(NFT.uri, null, Number(process.env.IPFS_REQUEST_TIMEOUT) || 8000).catch((_e) => {
      L.error('fetch error:' + _e);
      throw new Error('Could not retrieve NFT data from ' + NFT.uri)
    });
    if (response) {
      const info: {media?: {url: string},cryptedMedia?: {url: string}} = await response.json();
      if (info.media.url.indexOf('/ipfs') >= 0 && info.media.url.indexOf(defaultIpfsGateway) < 0) {
        info.media.url = overwriteDefaultIpfsGateway(info.media.url);
      }
      if (info.cryptedMedia.url.indexOf(defaultIpfsGateway) < 0) {
        info.cryptedMedia.url = overwriteDefaultIpfsGateway(info.cryptedMedia.url);
      }
      return info;
    } else {
      return {};
    }
  } catch (err) {
    L.error("invalid NFT uri:" + err);
    return {};
  }
}

/**
 * Populates an NFT obejct with categories from database
 * @param NFT - NFT object with id field
 * @returns NFT object with new categories field from db
 */
export async function populateNFTCategories(
  NFT: INFT
): Promise<ICategory[]> {
  try {
    const categories = await NFTService.findCategoriesFromNFTId(NFT.id);
    if (!categories) return []
    return categories;
  } catch (err) {
    L.error({ err }, "error retrieving nft's categories from mongo");
    return [];
  }
}